// Shared Metal renderer for the iOS Kaleidoscope effects. Owns the
// MTLDevice, command queue, the CVMetalTextureCache used for both input
// ingestion and output, the precompiled-at-runtime pipeline states for the
// three transpiled shaders (passthrough, blur, composite), an output
// CVPixelBufferPool, and the blur ping-pong intermediate textures.
//
// One instance is created per processor (BlurProcessor, BackgroundImage-
// Processor); a processor's `capturer:didCaptureVideoFrame:` is the only
// caller, and the upstream rn-webrtc pipeline serializes per processor on a
// single capture queue, so the renderer does not need its own lock. The
// owning processor still wraps every call in its own try/catch and falls
// through to the original frame on any failure (defensive-by-default: a
// processor must never crash the capture pipeline).
//
// ORIENTATION CONVENTION (verified against the mirror case):
//   The transpiled spirv-cross shaders did NOT invert gl_Position.y, and did
//   NOT invert vUv. In GL, vUv=(0,0) -> clip (-1,-1) (bottom-left) and the
//   texture's (0,0) texel is bottom-left, so sampling and the framebuffer
//   agree. In Metal, clip (-1,-1) is still bottom-left but the render-target
//   texel (0,0) is top-left, AND the sampled texture's (0,0) texel is
//   top-left. Both the read and the write flip together relative to GL, so
//   the net mapping "the texel I sample at vUv lands at the framebuffer
//   location for vUv" is preserved. A passthrough is therefore a true
//   passthrough on Metal with no Y handling required, as long as the input
//   texture and the output texture share the same (top-left) origin
//   convention. They do: both are CVMetalTextureCache views of NV12/BGRA
//   IOSurface-backed CVPixelBuffers, which are top-left-origin. So the output
//   is NOT vertically flipped. The mirror effect adds a horizontal-only flip
//   by sampling u -> (1 - u) in its own pass; it does not touch v, so it
//   cannot introduce a vertical flip. This is the verification anchor for the
//   whole convention.

import Foundation
import Metal
import CoreVideo
import os.log

/// Errors thrown during renderer setup or per-frame work. The owning
/// processor catches these and falls through to the original frame.
enum RendererError: Error {
  case noMetalDevice
  case libraryCompileFailed(String)
  case missingFunction(String)
  case pipelineCreateFailed(String)
  case textureCacheCreateFailed(OSStatus)
  case pixelBufferPoolCreateFailed(OSStatus)
  case pixelBufferAllocFailed(OSStatus)
  case textureBindFailed(String)
  case commandBufferUnavailable
}

final class MetalRenderer {
  static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Renderer")

  let device: MTLDevice
  private let commandQueue: MTLCommandQueue
  let textureCache: CVMetalTextureCache

  // Pipeline states for the three transpiled shaders. All three .metal files
  // share the entry-point name `main0` (spirv-cross emits that for every
  // stage), so they CANNOT coexist in one MTLLibrary. Each is compiled into
  // its OWN MTLLibrary at runtime from the .metal source text read out of the
  // Kaleidoscope resource bundle, and we pull `main0` from each. See
  // ShaderLibrary.swift for the loader. Runtime makeLibrary(source:) is the
  // safe path here because renaming the entry points would be clobbered the
  // next time scripts/transpile-shaders.ts regenerates the MSL.
  let passthroughVertex: MTLFunction
  let blurPipeline: MTLRenderPipelineState
  let compositePipeline: MTLRenderPipelineState

  // Linear-clamp sampler shared by every pass (matches the Android GL_LINEAR
  // + GL_CLAMP_TO_EDGE setup). Clamp avoids edge bleed when cover-fit UVs or
  // blur taps reach outside [0,1].
  let linearClampSampler: MTLSamplerState

  // Output pool + cached dimensions. Recreated on resolution change.
  private var outputPool: CVPixelBufferPool?
  private var poolWidth = 0
  private var poolHeight = 0

  // Blur ping-pong intermediate textures (BGRA, full input resolution).
  // Recreated on resolution change. Only allocated when the blur path runs.
  private var blurTexA: MTLTexture?
  private var blurTexB: MTLTexture?
  private var blurTexWidth = 0
  private var blurTexHeight = 0

  // "original" RGB ingest texture (BGRA, full resolution), reused across
  // frames. CoreImage renders the NV12 input into this buffer's IOSurface;
  // see TextureBridge.ingest. Held here so the backing CVPixelBuffer (and its
  // IOSurface) survive between frames instead of being reallocated.
  private var originalBuffer: CVPixelBuffer?
  private var originalTexture: MTLTexture?
  private var originalWidth = 0
  private var originalHeight = 0

  init(bundle: Bundle) throws {
    guard let dev = MTLCreateSystemDefaultDevice() else {
      throw RendererError.noMetalDevice
    }
    self.device = dev

    guard let queue = dev.makeCommandQueue() else {
      throw RendererError.pipelineCreateFailed("makeCommandQueue returned nil")
    }
    self.commandQueue = queue

    var cache: CVMetalTextureCache?
    let cacheStatus = CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, dev, nil, &cache)
    guard cacheStatus == kCVReturnSuccess, let unwrappedCache = cache else {
      throw RendererError.textureCacheCreateFailed(cacheStatus)
    }
    self.textureCache = unwrappedCache

    // Compile each .metal as its own library and pull `main0`.
    let passthrough = try ShaderLibrary(device: dev, bundle: bundle, fileName: "passthrough")
    let blur = try ShaderLibrary(device: dev, bundle: bundle, fileName: "blur")
    let composite = try ShaderLibrary(device: dev, bundle: bundle, fileName: "composite")

    self.passthroughVertex = try passthrough.function()

    // Both fragment pipelines reuse the passthrough vertex (fullscreen
    // triangle generated from gl_VertexID; no vertex buffer).
    self.blurPipeline = try MetalRenderer.makePipeline(
      device: dev,
      vertex: passthroughVertex,
      fragment: try blur.function(),
      label: "blur"
    )
    self.compositePipeline = try MetalRenderer.makePipeline(
      device: dev,
      vertex: passthroughVertex,
      fragment: try composite.function(),
      label: "composite"
    )

    let samplerDesc = MTLSamplerDescriptor()
    samplerDesc.minFilter = .linear
    samplerDesc.magFilter = .linear
    samplerDesc.sAddressMode = .clampToEdge
    samplerDesc.tAddressMode = .clampToEdge
    guard let sampler = dev.makeSamplerState(descriptor: samplerDesc) else {
      throw RendererError.pipelineCreateFailed("makeSamplerState returned nil")
    }
    self.linearClampSampler = sampler
  }

  private static func makePipeline(
    device: MTLDevice,
    vertex: MTLFunction,
    fragment: MTLFunction,
    label: String
  ) throws -> MTLRenderPipelineState {
    let desc = MTLRenderPipelineDescriptor()
    desc.label = label
    desc.vertexFunction = vertex
    desc.fragmentFunction = fragment
    // All passes render into BGRA buffers (intermediates and the output).
    desc.colorAttachments[0].pixelFormat = .bgra8Unorm
    do {
      return try device.makeRenderPipelineState(descriptor: desc)
    } catch {
      throw RendererError.pipelineCreateFailed("\(label): \(error.localizedDescription)")
    }
  }

  func makeCommandBuffer() throws -> MTLCommandBuffer {
    guard let cb = commandQueue.makeCommandBuffer() else {
      throw RendererError.commandBufferUnavailable
    }
    return cb
  }

  // MARK: - Output buffer pool

  /// Returns a fresh BGRA, IOSurface-backed, Metal-compatible CVPixelBuffer
  /// from the pool, recreating the pool if dimensions changed. The pool keeps
  /// allocation off the per-frame hot path; the buffer is owned by the caller
  /// and released when the RTCVideoFrame that wraps it is released.
  func dequeueOutputBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    if outputPool == nil || poolWidth != width || poolHeight != height {
      try rebuildOutputPool(width: width, height: height)
    }
    guard let pool = outputPool else {
      throw RendererError.pixelBufferPoolCreateFailed(kCVReturnError)
    }
    var pixelBuffer: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
    guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
      throw RendererError.pixelBufferAllocFailed(status)
    }
    return buffer
  }

  private func rebuildOutputPool(width: Int, height: Int) throws {
    let pixelBufferAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      // IOSurface-backed so downstream (RTCCVPixelBuffer -> I420 -> encoder)
      // accepts the buffer; Metal-compatible so CVMetalTextureCache can wrap
      // it as a render-target texture without a copy.
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
      kCVPixelBufferMetalCompatibilityKey as String: true,
    ]
    let poolAttributes: [String: Any] = [
      kCVPixelBufferPoolMinimumBufferCountKey as String: 3,
    ]
    var pool: CVPixelBufferPool?
    let status = CVPixelBufferPoolCreate(
      kCFAllocatorDefault,
      poolAttributes as CFDictionary,
      pixelBufferAttributes as CFDictionary,
      &pool
    )
    guard status == kCVReturnSuccess, let createdPool = pool else {
      throw RendererError.pixelBufferPoolCreateFailed(status)
    }
    outputPool = createdPool
    poolWidth = width
    poolHeight = height
  }

  // MARK: - Intermediate textures

  /// Returns the cached "original" ingest texture (BGRA), allocating it (and
  /// its backing CVPixelBuffer) on first use or on resolution change. The
  /// returned tuple's CVPixelBuffer is the CoreImage render target; the
  /// MTLTexture is a zero-copy view of the same IOSurface.
  func originalIngestTarget(width: Int, height: Int) throws -> (CVPixelBuffer, MTLTexture) {
    if let buffer = originalBuffer, let tex = originalTexture,
       originalWidth == width, originalHeight == height {
      return (buffer, tex)
    }
    let buffer = try TextureBridge.makeMetalCompatibleBGRABuffer(width: width, height: height)
    let texture = try TextureBridge.makeTexture(
      from: buffer,
      cache: textureCache,
      pixelFormat: .bgra8Unorm,
      planeIndex: 0
    )
    originalBuffer = buffer
    originalTexture = texture
    originalWidth = width
    originalHeight = height
    return (buffer, texture)
  }

  /// Returns the two blur ping-pong textures, allocating on first use or on
  /// resolution change.
  func blurPingPong(width: Int, height: Int) throws -> (MTLTexture, MTLTexture) {
    if let a = blurTexA, let b = blurTexB, blurTexWidth == width, blurTexHeight == height {
      return (a, b)
    }
    let a = try makeRenderTargetTexture(width: width, height: height)
    let b = try makeRenderTargetTexture(width: width, height: height)
    blurTexA = a
    blurTexB = b
    blurTexWidth = width
    blurTexHeight = height
    return (a, b)
  }

  private func makeRenderTargetTexture(width: Int, height: Int) throws -> MTLTexture {
    let desc = MTLTextureDescriptor.texture2DDescriptor(
      pixelFormat: .bgra8Unorm,
      width: width,
      height: height,
      mipmapped: false
    )
    desc.usage = [.renderTarget, .shaderRead]
    desc.storageMode = .private
    guard let tex = device.makeTexture(descriptor: desc) else {
      throw RendererError.textureBindFailed("makeTexture (render target) returned nil")
    }
    return tex
  }

  // MARK: - Draw helpers

  /// Encodes a fullscreen-triangle draw into `target` using the given
  /// pipeline. The caller binds fragment buffers/textures/samplers via the
  /// `configure` closure. Loads the attachment as `.dontCare` (we overwrite
  /// every texel) and stores it.
  func drawFullscreen(
    commandBuffer: MTLCommandBuffer,
    pipeline: MTLRenderPipelineState,
    target: MTLTexture,
    label: String,
    configure: (MTLRenderCommandEncoder) -> Void
  ) throws {
    let passDesc = MTLRenderPassDescriptor()
    passDesc.colorAttachments[0].texture = target
    passDesc.colorAttachments[0].loadAction = .dontCare
    passDesc.colorAttachments[0].storeAction = .store
    guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: passDesc) else {
      throw RendererError.commandBufferUnavailable
    }
    encoder.label = label
    encoder.setRenderPipelineState(pipeline)
    configure(encoder)
    // 3 vertices: the fullscreen triangle is generated entirely from
    // gl_VertexID in the vertex shader; no vertex buffer is bound.
    encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
    encoder.endEncoding()
  }

  /// Encode one separable blur pass (`source` -> `target`) along `axis`.
  /// Binds the 9-float weights at buffer(0), the float2 axis at buffer(9), and
  /// the 9-float offsets at buffer(10), matching blur.metal's bindings. The
  /// spvUnsafeArray<float,9> parameters are 9 tightly packed floats (36 bytes)
  /// each; setFragmentBytes with the kernel's contiguous arrays satisfies that
  /// layout.
  func encodeBlurPass(
    commandBuffer: MTLCommandBuffer,
    source: MTLTexture,
    target: MTLTexture,
    kernel: BlurKernel,
    axis: SIMD2<Float>,
    label: String
  ) throws {
    try drawFullscreen(
      commandBuffer: commandBuffer,
      pipeline: blurPipeline,
      target: target,
      label: label
    ) { encoder in
      // spvUnsafeArray<float,9> is 9 tightly packed floats (36 bytes). A Swift
      // [Float] of 9 elements is contiguous with stride 4, so withUnsafeBytes
      // hands setFragmentBytes the exact 36-byte layout the shader expects.
      kernel.weights.withUnsafeBytes { ptr in
        encoder.setFragmentBytes(ptr.baseAddress!, length: ptr.count, index: 0)
      }
      var axisVar = axis
      encoder.setFragmentBytes(&axisVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 9)
      kernel.offsets.withUnsafeBytes { ptr in
        encoder.setFragmentBytes(ptr.baseAddress!, length: ptr.count, index: 10)
      }
      encoder.setFragmentTexture(source, index: 0)
      encoder.setFragmentSamplerState(linearClampSampler, index: 0)
    }
  }

  /// Encode the composite pass into `target`.
  /// composite.metal bindings: buffer(0) uMaskUvScale, (1) uMaskUvOffset,
  /// (2) uMaskHi, (3) uMaskLo, (4) uBgUvScale, (5) uBgUvOffset; texture(0)
  /// uMask, (1) uOriginal, (2) uBackground; samplers 0/1/2.
  func encodeComposite(
    commandBuffer: MTLCommandBuffer,
    target: MTLTexture,
    original: MTLTexture,
    background: MTLTexture,
    mask: MTLTexture,
    maskUvScale: SIMD2<Float>,
    maskUvOffset: SIMD2<Float>,
    maskHi: Float,
    maskLo: Float,
    bgUvScale: SIMD2<Float>,
    bgUvOffset: SIMD2<Float>,
    label: String
  ) throws {
    try drawFullscreen(
      commandBuffer: commandBuffer,
      pipeline: compositePipeline,
      target: target,
      label: label
    ) { encoder in
      var maskUvScaleVar = maskUvScale
      var maskUvOffsetVar = maskUvOffset
      var maskHiVar = maskHi
      var maskLoVar = maskLo
      var bgUvScaleVar = bgUvScale
      var bgUvOffsetVar = bgUvOffset
      encoder.setFragmentBytes(&maskUvScaleVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
      encoder.setFragmentBytes(&maskUvOffsetVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 1)
      encoder.setFragmentBytes(&maskHiVar, length: MemoryLayout<Float>.stride, index: 2)
      encoder.setFragmentBytes(&maskLoVar, length: MemoryLayout<Float>.stride, index: 3)
      encoder.setFragmentBytes(&bgUvScaleVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 4)
      encoder.setFragmentBytes(&bgUvOffsetVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 5)
      encoder.setFragmentTexture(mask, index: 0)
      encoder.setFragmentTexture(original, index: 1)
      encoder.setFragmentTexture(background, index: 2)
      encoder.setFragmentSamplerState(linearClampSampler, index: 0)
      encoder.setFragmentSamplerState(linearClampSampler, index: 1)
      encoder.setFragmentSamplerState(linearClampSampler, index: 2)
    }
  }
}

/// A 9-tap separable Gaussian kernel. Direct port of BlurFactory.kt's
/// ensureKernel: tapSpacing 2.0; offset[i] = i*2; weight[i] = exp(-x^2 /
/// (2 sigma^2)); normalize so weight[0] + 2*sum(weight[1..8]) == 1 (the shader
/// samples +/- offset for the side taps and adds each, so each side tap counts
/// twice in the normalization). Rebuilt only when sigma changes.
struct BlurKernel {
  private(set) var weights = [Float](repeating: 0, count: 9)
  private(set) var offsets = [Float](repeating: 0, count: 9)
  private var cachedSigma: Float = .nan

  mutating func ensure(sigma: Float) {
    if sigma == cachedSigma { return }
    let tapSpacing = 2.0
    let sigmaD = Double(sigma)
    for i in 0..<9 {
      let x = Double(i) * tapSpacing
      offsets[i] = Float(x)
      weights[i] = Float(exp(-(x * x) / (2.0 * sigmaD * sigmaD)))
    }
    var sum = weights[0]
    for i in 1..<9 { sum += 2.0 * weights[i] }
    if sum > 0 {
      for i in 0..<9 { weights[i] /= sum }
    }
    cachedSigma = sigma
  }
}
