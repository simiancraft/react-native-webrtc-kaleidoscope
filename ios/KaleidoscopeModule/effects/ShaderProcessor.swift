// iOS generic generative-shader effect. Mirrors android/.../effects/ShaderFactory.kt.
//
// One class serves EVERY generative shader listed in GENERATIVE.txt (currently
// "plasma"); the shader name selects the fragment source at construction. There
// is NO per-shader Swift: uniforms are bound by name from the ShaderUniforms
// side-channel via the shader's own MSL buffer-index decorations, so adding a
// generative .frag (which regenerates GENERATIVE.txt and ships a new .metalsrc)
// registers and runs with no change here.
//
// Per frame (mirrors BackgroundImageProcessor, with the image swapped for a
// procedural render):
//   1. Ingest the camera CVPixelBuffer (NV12) into the DISPLAY-UPRIGHT "original"
//      BGRA Metal texture via CoreImage (Ingest.swift).
//   2. Render the generative shader into a cached "background" texture at display
//      size, setting uTime (host monotonic seconds via CACurrentMediaTime),
//      uResolution, and EACH uniform from ShaderUniforms.get(shaderName) bound
//      generically by name -> buffer index.
//   3. Read the latest completed mask; if none yet, forward the ORIGINAL frame.
//      Kick a new segmentation if idle.
//   4. Composite original (foreground) + shader-background + mask exactly like
//      BackgroundImageProcessor, with an identity bg cover-fit (the shader fills
//      the display-sized target) and the blur-path V-flip parity term (the
//      generative pass is a single render-to-texture pass, the same odd parity as
//      one blur pass; see the bgUvScale note below).
//
// One instance per registered generative name (e.g. "plasma"), shared across
// every frame, so all mutable state is guarded by an os_unfair_lock. Every
// failure path logs under Kaleidoscope.Shader and returns the ORIGINAL frame;
// the processor must never crash the capture pipeline (no debugger on EAS).

import Foundation
import CoreVideo
import Metal
import QuartzCore
import simd
import os.log
import WebRTC
// Import whichever react-native-webrtc fork is present; both expose the same
// VideoFrameProcessorDelegate / ProcessorProvider symbols. See Registration.swift.
#if canImport(livekit_react_native_webrtc)
import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
import react_native_webrtc
#endif

@objc(KaleidoscopeShaderProcessor)
public final class ShaderProcessor: NSObject, VideoFrameProcessorDelegate {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Shader")

  private let shaderName: String

  private var unsafeLock = os_unfair_lock_s()
  private var renderer: MetalRenderer?
  private var rendererFailed = false
  private let segmenter = Segmenter()

  // Built on first frame from `<shaderName>.metalsrc`. The pipeline runs the
  // generative fragment; `uniformIndices` maps each uniform NAME to the Metal
  // buffer index spirv-cross assigned it (NOT GLSL order; see
  // ShaderLibrary.uniformBufferIndices). Both are nil until the first successful
  // ensure; a build failure sets shaderFailed so we degrade to passthrough
  // rather than recompiling every frame.
  private var generativePipeline: MTLRenderPipelineState?
  private var uniformIndices: [String: Int] = [:]
  private var shaderFailed = false

  // Cached display-sized background target; rebuilt on resolution change.
  private var backgroundTexture: MTLTexture?
  private var backgroundWidth = 0
  private var backgroundHeight = 0

  // Host monotonic clock origin for uTime. CACurrentMediaTime() is mach_absolute
  // time in seconds, monotonic and unaffected by wall-clock changes — the same
  // role as Android's System.nanoTime() anchored at first frame. Anchoring keeps
  // uTime small and precise (absolute mach time is large). nil until first frame.
  private var startTime: CFTimeInterval?

  // Reserved buffer indices the host always provides. These are the NAMES the
  // generative GLSL contract defines as host-supplied; their actual buffer
  // indices come from uniformIndices, NOT these constants. Listed so a JS-set
  // uniform of the same name does not double-bind (the host owns them).
  private static let builtinNames: Set<String> = ["uTime", "uResolution"]

  @objc public init(forName name: String) {
    self.shaderName = name
    super.init()
  }

  @objc(capturer:didCaptureVideoFrame:)
  public func capturer(
    _ capturer: RTCVideoCapturer,
    didCapture frame: RTCVideoFrame
  ) -> RTCVideoFrame {
    os_unfair_lock_lock(&unsafeLock)
    defer { os_unfair_lock_unlock(&unsafeLock) }
    do {
      return try process(frame)
    } catch {
      os_log("shader %{public}@ failed; forwarding original. %{public}@",
             log: ShaderProcessor.log, type: .error,
             shaderName, error.localizedDescription)
      return frame
    }
  }

  private func ensureRenderer() throws -> MetalRenderer {
    if let renderer = renderer { return renderer }
    if rendererFailed { throw RendererError.noMetalDevice }
    do {
      let created = try MetalRenderer(bundle: Bundle(for: ShaderProcessor.self))
      renderer = created
      return created
    } catch {
      rendererFailed = true
      throw error
    }
  }

  /// Build-or-return the generative pipeline + uniform index map. Compiles
  /// `<shaderName>.metalsrc` into its own MTLLibrary (each spirv-cross `main0`
  /// stays in its own namespace; see ShaderLibrary) and parses the buffer-index
  /// decorations. Caches success and failure so a missing/broken shader degrades
  /// to passthrough without recompiling per frame.
  private func ensureGenerative(renderer: MetalRenderer) -> MTLRenderPipelineState? {
    if let pipeline = generativePipeline { return pipeline }
    if shaderFailed { return nil }
    do {
      let library = try ShaderLibrary(
        device: renderer.device,
        bundle: Bundle(for: ShaderProcessor.self),
        fileName: shaderName
      )
      let fragment = try library.function()
      let pipeline = try renderer.makeGenerativePipeline(
        fragment: fragment, label: "generative-\(shaderName)"
      )
      uniformIndices = library.uniformBufferIndices()
      generativePipeline = pipeline
      os_log("generative shader %{public}@ compiled; uniform indices: %{public}@",
             log: ShaderProcessor.log, type: .info,
             shaderName, String(describing: uniformIndices))
      return pipeline
    } catch {
      shaderFailed = true
      os_log("generative shader %{public}@ build failed: %{public}@",
             log: ShaderProcessor.log, type: .error,
             shaderName, error.localizedDescription)
      return nil
    }
  }

  private func ensureBackgroundTexture(
    renderer: MetalRenderer, width: Int, height: Int
  ) throws -> MTLTexture {
    if let tex = backgroundTexture, backgroundWidth == width, backgroundHeight == height {
      return tex
    }
    let tex = try renderer.makeGenerativeTarget(width: width, height: height)
    backgroundTexture = tex
    backgroundWidth = width
    backgroundHeight = height
    return tex
  }

  private func process(_ frame: RTCVideoFrame) throws -> RTCVideoFrame {
    guard let input = FrameBridge.inputPixelBuffer(frame) else {
      return frame
    }
    let bufferW = CVPixelBufferGetWidth(input)
    let bufferH = CVPixelBufferGetHeight(input)
    guard bufferW > 0, bufferH > 0 else { return frame }

    let renderer = try ensureRenderer()
    guard let generativePipeline = ensureGenerative(renderer: renderer) else {
      // Shader unavailable; forward the original instead of compositing onto
      // nothing.
      return frame
    }

    // Step 1: ingest NV12 -> DISPLAY-UPRIGHT "original" BGRA texture (Ingest.swift).
    // `width`/`height` are the DISPLAY dims (buffer dims swapped on a 90/270
    // frame); the generative pass, segmenter, output, and emitted rotation 0 are
    // all sized from them.
    let rotation = frame.rotation.rawValue
    let width = Ingest.displayWidth(bufferWidth: bufferW, bufferHeight: bufferH, rotation: rotation)
    let height = Ingest.displayHeight(bufferWidth: bufferW, bufferHeight: bufferH, rotation: rotation)
    let (originalBuffer, originalTexture, originalWrapper) = try renderer.originalIngestTarget(
      width: width, height: height
    )
    try TextureBridge.ingest(input: input, into: originalBuffer, frameRotation: rotation)

    // Step 2: latest mask or forward original. Kick a new segmentation if idle.
    guard let maskBuffer = segmenter.latestMask() else {
      segmenter.kickIfIdle(input: originalBuffer)
      return frame
    }
    segmenter.kickIfIdle(input: originalBuffer)

    let (maskTexture, maskWrapper) = try TextureBridge.makeTexture(
      from: maskBuffer,
      cache: renderer.textureCache,
      pixelFormat: .r8Unorm,
      planeIndex: 0
    )

    // Step 3: render the generative shader into the cached background target.
    let backgroundTexture = try ensureBackgroundTexture(
      renderer: renderer, width: width, height: height
    )

    // Anchor the monotonic clock at first frame; uTime is seconds since then.
    let now = CACurrentMediaTime()
    if startTime == nil { startTime = now }
    let elapsed = Float(now - (startTime ?? now))

    let builtinBindings = makeBuiltinBindings(
      elapsed: elapsed, width: width, height: height
    )
    let uniformBindings = makeUniformBindings()

    let commandBuffer = try renderer.makeCommandBuffer()
    commandBuffer.label = "Kaleidoscope.Shader"
    try renderer.encodeGenerative(
      commandBuffer: commandBuffer,
      pipeline: generativePipeline,
      target: backgroundTexture,
      builtinBindings: builtinBindings,
      uniformBindings: uniformBindings,
      label: "generative-\(shaderName)"
    )

    // Step 4: composite original (fg) + shader-bg (bg) + mask -> output. The
    // shader already fills the display-sized target, so the bg cover-fit is
    // IDENTITY on scale/offset; only the V-flip parity term remains.
    let (maskLo, maskHi) = MaskTuning.smoothstepRange(
      hardness: EffectTuning.maskHardness,
      threshold: EffectTuning.maskThreshold
    )
    let output = try renderer.dequeueOutputBuffer(width: width, height: height)
    let (outputTexture, outputWrapper) = try TextureBridge.makeTexture(
      from: output,
      cache: renderer.textureCache,
      pixelFormat: .bgra8Unorm,
      planeIndex: 0
    )

    try renderer.encodeComposite(
      commandBuffer: commandBuffer,
      target: outputTexture,
      original: originalTexture,
      background: backgroundTexture,
      mask: maskTexture,
      maskUvScale: SIMD2<Float>(1, 1),
      maskUvOffset: SIMD2<Float>(0, 0),
      maskHi: maskHi,
      maskLo: maskLo,
      // RENDER-PASS-PARITY V-flip, identical to BlurProcessor's bg term. The
      // generative shader writes the background through ONE Metal render pass
      // (encodeGenerative), an odd parity; the composite then samples uOriginal
      // directly in its single pass (the foreground rides 0 Metal passes). The
      // transpiled spirv-cross passthrough vertex does not negate gl_Position.y
      // (see MetalRenderer header), so the background arrives V-flipped relative
      // to the foreground and needs bgUv.y -> 1 - bgUv.y. This is independent of
      // camera orientation (handled at ingest) and of the procedural shader's own
      // "zero net texture flips" property (which is about its INPUT handoff, of
      // which it has none; this term is about its OUTPUT going through one extra
      // render pass before the composite samples it). RISK: parity is reasoned,
      // not device-verified on iOS; if plasma renders vertically inverted on a
      // device, this is the single term to flip to (1,1)/(0,0).
      bgUvScale: SIMD2<Float>(1, -1),
      bgUvOffset: SIMD2<Float>(0, 1),
      label: "shader-composite"
    )

    // R3 frame-pipelining (see BlurProcessor / MetalRenderer.commitPipelined).
    // keepAlive holds the per-frame inputs the in-flight GPU command buffer still
    // reads after process() returns: the mask CVPixelBuffer + its wrapper, the
    // output wrapper, and the pooled original buffer + wrapper. The background
    // MTLTexture is renderer-cached on this instance (.private, not a pool buffer
    // / IOSurface), so it needs no keep-alive, same as a blur ping-pong texture.
    guard let ready = renderer.commitPipelined(
      commandBuffer,
      currentOutput: output,
      keepAlive: [maskBuffer, maskWrapper, outputWrapper, originalBuffer, originalWrapper],
      debugTiming: EffectTuning.debugTiming,
      timingLabel: "shader-\(shaderName)"
    ) else {
      return frame
    }

    return FrameBridge.makeOutputFrame(pixelBuffer: ready, like: frame)
  }

  /// Build the host-supplied built-in bindings (uTime, uResolution) at whatever
  /// buffer indices THIS shader's MSL assigned them. A shader that omits one is
  /// simply not bound (absent from uniformIndices); spirv-cross only emits a
  /// `[[buffer(n)]]` argument for a uniform the GLSL actually references.
  private func makeBuiltinBindings(
    elapsed: Float, width: Int, height: Int
  ) -> [(index: Int, value: [Float])] {
    var bindings = [(index: Int, value: [Float])]()
    if let i = uniformIndices["uTime"] {
      bindings.append((index: i, value: [elapsed]))
    }
    if let i = uniformIndices["uResolution"] {
      // float2: 8 bytes, no padding needed.
      bindings.append((index: i, value: [Float(width), Float(height)]))
    }
    return bindings
  }

  /// Build the JS-set uniform bindings, each resolved name -> buffer index via
  /// the shader's MSL decorations. NAME-AGNOSTIC: no plasma-specific names. A
  /// uniform whose name the shader does not declare (absent from uniformIndices)
  /// is skipped; a builtin name (uTime/uResolution) is skipped here because the
  /// host owns it. float3 is PADDED to 4 floats (16 bytes): in a Metal `constant`
  /// buffer argument a `float3` occupies 16 bytes (4-float alignment), so binding
  /// only 12 bytes can trip the Metal validation layer's buffer-size check and
  /// reads the .w lane as garbage; padding to 16 makes the bound size match the
  /// argument's size exactly. The shader reads only .xyz, so the pad is inert.
  /// float2/float4 are already correctly sized (8 / 16 bytes); a scalar is 4.
  private func makeUniformBindings() -> [(index: Int, value: [Float])] {
    guard let uniforms = ShaderUniforms.get(shaderName) else { return [] }
    var bindings = [(index: Int, value: [Float])]()
    for (name, values) in uniforms {
      if ShaderProcessor.builtinNames.contains(name) { continue }
      guard let index = uniformIndices[name] else { continue }
      switch values.count {
      case 1, 2, 4:
        bindings.append((index: index, value: values))
      case 3:
        // Pad float3 to 16 bytes (see method doc).
        bindings.append((index: index, value: [values[0], values[1], values[2], 0]))
      default:
        os_log("shader %{public}@ uniform %{public}@ has unsupported length %d; skipping",
               log: ShaderProcessor.log, type: .info, shaderName, name, values.count)
      }
    }
    return bindings
  }
}
