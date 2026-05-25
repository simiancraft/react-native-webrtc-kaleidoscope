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
import simd
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
  static let perfLog = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Perf")

  let device: MTLDevice
  private let commandQueue: MTLCommandQueue
  let textureCache: CVMetalTextureCache

  // R3 frame-pipelining. Instead of committing the current command buffer and
  // blocking on waitUntilCompleted (which serializes CPU and GPU every frame),
  // we commit asynchronously and return the PREVIOUS frame's completed output,
  // adding one frame of latency. The semaphore caps the number of command
  // buffers in flight so the CPU cannot outrun the GPU unboundedly; value 2
  // lets the GPU work on frame N while the CPU encodes frame N+1. The output
  // CVPixelBufferPool (min 3) has enough buffers to back the in-flight frame,
  // the held previous frame, and one being dequeued.
  private let inFlightSemaphore = DispatchSemaphore(value: 2)

  // The most recent output buffer whose GPU work has COMPLETED, published by
  // the command-buffer completion handler. The capture thread reads it to
  // return last frame's result while this frame's work runs asynchronously.
  // nil before the first frame completes; the caller forwards the original
  // frame in that case. Publishing only on completion (rather than relying on
  // the semaphore + in-order queue to imply completion) means a returned buffer
  // is never read by WebRTC before the GPU finished writing it: the buffer-
  // lifecycle safety is explicit, not timing-derived. Shared between the
  // completion handler (writer) and the capture thread (reader); guarded by
  // pipelineLock.
  private var readyOutput: CVPixelBuffer?
  private var pipelineLock = os_unfair_lock_s()

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
  let transformPipeline: MTLRenderPipelineState

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

  // "original" RGB ingest buffers come from a POOL, not a single reused buffer.
  // CoreImage renders each frame's NV12 input into a freshly dequeued buffer
  // (TextureBridge.ingest) and the GPU passes sample a per-frame texture view of
  // it. A single shared buffer is WRONG here: under R3 frame-pipelining the
  // previous frame's command buffer is still reading the original after
  // process() returns, AND the segmenter's async worker still reads it (it
  // retains the ref for its downscale), so overwriting one buffer in place
  // corrupted those in-flight reads (the mask drift / "fog of war"). A pool only
  // recycles a buffer once every reader has released it: the command buffer via
  // commitPipelined's keepAlive, the segmenter via its async closure's retain.
  private var originalPool: CVPixelBufferPool?
  private var originalPoolWidth = 0
  private var originalPoolHeight = 0

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
    let transform = try ShaderLibrary(device: dev, bundle: bundle, fileName: "transform")

    self.passthroughVertex = try passthrough.function()

    // Both fragment pipelines reuse the passthrough vertex (fullscreen
    // quad generated from gl_VertexID via TRIANGLE_STRIP; no vertex buffer).
    // The shader is designed for FOUR vertices (see shaders/passthrough.vert);
    // see drawFullscreen below for the matching drawPrimitives call.
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
    self.transformPipeline = try MetalRenderer.makePipeline(
      device: dev,
      vertex: passthroughVertex,
      fragment: try transform.function(),
      label: "transform"
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

  /// R3 frame-pipelining commit. Replaces `commit()` + `waitUntilCompleted()`.
  ///
  /// - Throttles in-flight command buffers via the semaphore (waits before
  ///   commit; the completion handler signals), so the CPU cannot outrun the
  ///   GPU unboundedly. The literal R3 sketch waits "before encoding"; we wait
  ///   here, immediately before commit, which bounds the GPU-relevant quantity
  ///   (committed-but-incomplete buffers) identically and keeps the throttle in
  ///   one place. The processor's per-frame work between makeCommandBuffer and
  ///   this call is cheap CPU encoding, not GPU execution.
  /// - Registers a completion handler that PUBLISHES `currentOutput` as the
  ///   ready-to-return buffer only once the GPU has finished writing it, then
  ///   signals the semaphore. Optionally logs GPU time under "Perf".
  /// - Commits asynchronously (no wait) and returns the PREVIOUSLY-published
  ///   output, i.e. last frame's completed result. Returns nil before any frame
  ///   has completed (first frame); the caller forwards the original frame.
  ///
  /// `currentOutput` must be the pooled buffer the command buffer wrote into
  /// this frame. The returned buffer (last frame's) is a distinct pooled buffer;
  /// the pool's min count keeps current, previously-returned, and in-flight
  /// buffers from colliding.
  ///
  /// `keepAlive` holds any per-frame references whose backing the GPU reads or
  /// writes for this command buffer but which would otherwise be released when
  /// the encoding frame returns: the input/mask CVPixelBuffers AND the
  /// CVMetalTexture wrappers vended by TextureBridge.makeTexture (the wrapper, not
  /// the bare MTLTexture, is what pins the IOSurface for the cache). Under R3 the
  /// command buffer is still in flight after process() returns, so capturing these
  /// in the completion handler keeps them live for exactly as long as the GPU
  /// needs them and no longer; without this the source pool can reclaim and
  /// overwrite a buffer mid-GPU-read (the segmentation-mask curl-noise drift).
  func commitPipelined(
    _ commandBuffer: MTLCommandBuffer,
    currentOutput: CVPixelBuffer,
    keepAlive: [Any],
    debugTiming: Bool,
    timingLabel: String
  ) -> CVPixelBuffer? {
    inFlightSemaphore.wait()
    commandBuffer.addCompletedHandler { [weak self] completed in
      // Hold the per-frame inputs/wrappers until the GPU finishes. Referencing
      // `keepAlive` inside the closure is the entire point: it extends their
      // lifetime to command-buffer completion. Touched but intentionally unused.
      _ = keepAlive
      guard let self = self else { return }
      if debugTiming {
        let gpuMs = (completed.gpuEndTime - completed.gpuStartTime) * 1000.0
        os_log("%{public}@ gpu: %.2f ms", log: MetalRenderer.perfLog, type: .info,
               timingLabel, gpuMs)
      }
      if completed.error == nil {
        os_unfair_lock_lock(&self.pipelineLock)
        self.readyOutput = currentOutput
        os_unfair_lock_unlock(&self.pipelineLock)
      } else {
        os_log("%{public}@ command buffer error: %{public}@",
               log: MetalRenderer.log, type: .error,
               timingLabel, completed.error?.localizedDescription ?? "unknown")
      }
      self.inFlightSemaphore.signal()
    }
    commandBuffer.commit()

    os_unfair_lock_lock(&pipelineLock)
    let previous = readyOutput
    os_unfair_lock_unlock(&pipelineLock)
    return previous
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
    // min 4 covers the worst-case live set now that the completion handler
    // retains `currentOutput` until the GPU finishes: the semaphore (value 2)
    // permits TWO command buffers in flight, so two distinct `currentOutput`
    // buffers can be captured at once, PLUS the previously-published
    // `readyOutput` the capture thread may still be handing to WebRTC, PLUS the
    // one being dequeued this frame. 2 + 1 + 1 = 4. The pool grows past the
    // minimum if all are momentarily live, so 4 is the steady-state floor, not a
    // hard cap.
    outputPool = try MetalRenderer.makeBGRAMetalPool(width: width, height: height, minCount: 4)
    poolWidth = width
    poolHeight = height
  }

  /// Creates a CVPixelBufferPool of BGRA, IOSurface-backed, Metal-compatible
  /// buffers. Shared by the output pool and the original-ingest pool. IOSurface-
  /// backed so downstream (RTCCVPixelBuffer -> I420 -> encoder) accepts the
  /// buffer; Metal-compatible so CVMetalTextureCache can wrap it as a texture
  /// without a copy. Pools grow past `minCount` if more buffers are momentarily
  /// live, so the count is a steady-state floor, not a hard cap.
  private static func makeBGRAMetalPool(width: Int, height: Int, minCount: Int) throws
    -> CVPixelBufferPool {
    let pixelBufferAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
      kCVPixelBufferMetalCompatibilityKey as String: true,
    ]
    let poolAttributes: [String: Any] = [
      kCVPixelBufferPoolMinimumBufferCountKey as String: minCount,
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
    return createdPool
  }

  // MARK: - Intermediate textures

  /// Dequeues a fresh "original" ingest buffer (BGRA, IOSurface-backed,
  /// Metal-compatible) from the pool and returns it with a per-frame Metal
  /// texture view and the CVMetalTexture wrapper that pins it to the IOSurface.
  /// The CVPixelBuffer is the CoreImage render target; the MTLTexture is a
  /// zero-copy view of the same IOSurface.
  ///
  /// The caller MUST keep `buffer` and `wrapper` alive until its command buffer
  /// completes (pass both in commitPipelined's keepAlive); the segmenter
  /// separately retains the buffer for its async read. The pool will not recycle
  /// the buffer until both readers release it. See the originalPool field
  /// comment for why this is pooled and not a single reused buffer.
  func originalIngestTarget(width: Int, height: Int) throws
    -> (buffer: CVPixelBuffer, texture: MTLTexture, wrapper: CVMetalTexture) {
    if originalPool == nil || originalPoolWidth != width || originalPoolHeight != height {
      // Worst-case live set is 4: 2 GPU-in-flight (semaphore value 2, each
      // pinned via keepAlive) + 1 the segmenter's async worker still holds + 1
      // dequeued this frame. The CVMetalTexture wrapper does not occupy its own
      // pool slot (it pins the same buffer's IOSurface). 5 leaves one of
      // headroom; the pool grows past the floor on demand regardless.
      originalPool = try MetalRenderer.makeBGRAMetalPool(width: width, height: height, minCount: 5)
      originalPoolWidth = width
      originalPoolHeight = height
    }
    guard let pool = originalPool else {
      throw RendererError.pixelBufferPoolCreateFailed(kCVReturnError)
    }
    var pixelBuffer: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
    guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
      throw RendererError.pixelBufferAllocFailed(status)
    }
    let (texture, wrapper) = try TextureBridge.makeTexture(
      from: buffer,
      cache: textureCache,
      pixelFormat: .bgra8Unorm,
      planeIndex: 0
    )
    return (buffer, texture, wrapper)
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
    // Fullscreen quad via 4-vertex triangle strip. The passthrough vertex
    // shader (shaders/passthrough.vert) computes both gl_Position and vUv
    // from gl_VertexID alone for IDs 0..3, forming a quad that covers the
    // full NDC viewport. A 3-vertex .triangle call here would draw only
    // half the screen — the triangle ((-1,-1), (1,-1), (-1,1)) — with the
    // hypotenuse cutting diagonally across the frame, the SYMPTOM that
    // motivated this fix (half-black with diagonal staircase aliasing).
    encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    encoder.endEncoding()
  }

  /// Encode one separable blur pass (`source` -> `target`) along `axis`.
  /// Binds the 5-float weights at buffer(0), the float2 axis at buffer(5), and
  /// the 5-float offsets at buffer(6), matching the regenerated blur.metalsrc.
  /// spirv-cross numbers uAxis/uOffsets right after the uWeights array, so
  /// these indices track the array size (was 0/9/10 at 9 entries). setFragment-
  /// Bytes uses each array's contiguous byte layout (length: ptr.count), so the
  /// byte count adapts on its own.
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
      // spvUnsafeArray<float,5> is 5 tightly packed floats (20 bytes). A Swift
      // [Float] of 5 elements is contiguous with stride 4, so withUnsafeBytes
      // hands setFragmentBytes the exact 20-byte layout the shader expects.
      kernel.weights.withUnsafeBytes { ptr in
        encoder.setFragmentBytes(ptr.baseAddress!, length: ptr.count, index: 0)
      }
      var axisVar = axis
      encoder.setFragmentBytes(&axisVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 5)
      kernel.offsets.withUnsafeBytes { ptr in
        encoder.setFragmentBytes(ptr.baseAddress!, length: ptr.count, index: 6)
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

  /// Encode the geometric transform pass (`source` -> `target`) for the flip /
  /// rotate effects. transform.metalsrc bindings: buffer(0) uUvTransform
  /// (float2x2), texture(0) uTex, sampler(0) uTexSmplr. The host computes
  /// `uvTransform` via the Orientation helper (the single source of the
  /// camera-buffer reorientation math). For the 90-degree rotations `target` is
  /// dimension-swapped (h x w) relative to `source`.
  func encodeTransform(
    commandBuffer: MTLCommandBuffer,
    source: MTLTexture,
    target: MTLTexture,
    uvTransform: simd_float2x2,
    label: String
  ) throws {
    try drawFullscreen(
      commandBuffer: commandBuffer,
      pipeline: transformPipeline,
      target: target,
      label: label
    ) { encoder in
      // simd_float2x2 is two contiguous float2 columns (16 bytes), the exact
      // layout MSL's `constant float2x2&` expects at buffer(0).
      var uvTransformVar = uvTransform
      encoder.setFragmentBytes(
        &uvTransformVar,
        length: MemoryLayout<simd_float2x2>.stride,
        index: 0
      )
      encoder.setFragmentTexture(source, index: 0)
      encoder.setFragmentSamplerState(linearClampSampler, index: 0)
    }
  }
}

/// A linear-sampled separable Gaussian kernel: 5 entries (center + 4 bilinear
/// pairs of dense texels). Mirrors BlurFactory.ensureKernel and
/// src/web/blur-kernel.ts. Rebuilt only when sigma changes.
struct BlurKernel {
  private(set) var weights = [Float](repeating: 0, count: 5)
  private(set) var offsets = [Float](repeating: 0, count: 5)
  private var cachedSigma: Float = .nan

  mutating func ensure(sigma: Float) {
    if sigma == cachedSigma { return }
    let s = Double(sigma)
    func g(_ t: Double) -> Double { exp(-(t * t) / (2.0 * s * s)) }
    // Linear-sampled: center + 4 bilinear pairs of dense texels (1,2)(3,4)
    // (5,6)(7,8). See src/web/blur-kernel.ts for the shared derivation.
    offsets[0] = 0
    weights[0] = Float(g(0))
    var sum = weights[0]
    for p in 1..<5 {
      let a = Double(2 * p - 1)
      let b = Double(2 * p)
      let wa = g(a)
      let wb = g(b)
      let w = wa + wb
      offsets[p] = Float((a * wa + b * wb) / w)
      weights[p] = Float(w)
      sum += 2.0 * weights[p]
    }
    if sum > 0 {
      for i in 0..<5 { weights[i] /= sum }
    }
    cachedSigma = sigma
  }
}
