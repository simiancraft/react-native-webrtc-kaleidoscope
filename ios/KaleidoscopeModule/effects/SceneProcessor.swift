// iOS scene compositor. Mirrors android/.../effects/SceneFactory.kt on the iOS
// Metal pipeline.
//
// The multi-layer generalization of ShaderProcessor: a scene is an ordered
// painter's stack of layers (SceneLayers, delivered from JS via setSceneLayers),
// composited into ONE output texture, layer 0 opaque, later layers blended over.
// One processor instance serves EVERY scene; the layer stack is data, swapped
// from JS as the active scene changes, so adding a scene needs no Swift change.
//
// Per frame (builds on BackgroundImageProcessor / ShaderProcessor):
//   1. Ingest the camera CVPixelBuffer (NV12) into the DISPLAY-UPRIGHT "original"
//      BGRA Metal texture via CoreImage (Ingest.swift), as elsewhere.
//   2. If any layer targets the subject, read the latest mask (Segmenter). The
//      scene's BACKGROUND layers are mask-independent, so the scene composites
//      every frame and ONLY the subject layer is skipped until a mask has
//      completed (mirroring SceneFactory drawing the rest of the stack and
//      skipping the subject on maskTexId == -1). Kick a new segmentation when
//      idle.
//   3. Composite every layer into the output buffer's BGRA texture in ONE Metal
//      render pass: layer 0 clears to opaque black and draws with blending off;
//      later layers draw with premultiplied over (normal) or add (additive). Per
//      layer kind:
//        - 'image'  : cover-fit the plate (scene-image.metalsrc), premultiplied.
//        - 'direct' + subject : the masked person (scene-subject.metalsrc),
//                     premultiplied. Skipped if no mask (handled at step 2).
//        - generative : render its frag (the layer .metalsrc, reusing the generic
//                     uniform-by-name binding) with uTime/uResolution + uniforms.
//      A generative layer on the subject target is skipped (mirrors the web/
//      Android "for now"); a 'direct' background layer is a no-op.
//   4. Hand off via R3 frame-pipelining (commitPipelined), returning the PREVIOUS
//      completed frame, exactly like the other processors.
//
// One instance, shared across every frame, so all mutable state is guarded by an
// os_unfair_lock. Every failure path logs under Kaleidoscope.Scene and returns
// the ORIGINAL frame; the processor must never crash the capture pipeline.

import Foundation
import CoreVideo
import Metal
import MetalKit
import QuartzCore
import simd
import os.log
import WebRTC
#if canImport(livekit_react_native_webrtc)
import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
import react_native_webrtc
#endif

@objc(KaleidoscopeSceneProcessor)
public final class SceneProcessor: NSObject, VideoFrameProcessorDelegate {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Scene")

  private var unsafeLock = os_unfair_lock_s()
  private var renderer: MetalRenderer?
  private var rendererFailed = false
  private let segmenter = Segmenter()

  // Fixed (non-generative) layer fragments, compiled once. The image + subject
  // fragments live in their own .metalsrc; each needs the three blend variants
  // (opaque base, over, additive), cached by blend mode.
  private var imageFragment: MTLFunction?
  private var subjectFragment: MTLFunction?
  private var imageFailed = false
  private var subjectFailed = false

  // Pipeline-state cache keyed by "<fragment label>|<blend>". Image, subject, and
  // each generative shader get one pipeline per blend mode used. Built lazily.
  private var pipelineCache = [String: MTLRenderPipelineState]()

  // Generative layer fragments + their uniform-index maps, cached by shader name
  // (mirrors ShaderProcessor.ensureGenerative). A failed build is remembered so
  // we don't recompile per frame.
  private var generativeFragments = [String: MTLFunction]()
  private var generativeUniformIndices = [String: [String: Int]]()
  private var generativeFailed = Set<String>()

  // Plate textures by id, loaded lazily on first use; cached for the session.
  // Each entry carries the source aspect for cover-fit. A failed load is
  // remembered so we don't re-read the bundle every frame.
  private var plateTextures = [String: PlateTexture]()
  private var missingPlates = Set<String>()

  // Host monotonic clock origin for uTime (CACurrentMediaTime; see ShaderProcessor).
  private var startTime: CFTimeInterval?

  private static let builtinNames: Set<String> = ["uTime", "uResolution"]
  private static let scenePlatesSubdir = "scene-plates"

  private struct PlateTexture {
    let texture: MTLTexture
    let aspect: Float
  }

  @objc public override init() {
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
      os_log("scene failed; forwarding original. %{public}@",
             log: SceneProcessor.log, type: .error, error.localizedDescription)
      return frame
    }
  }

  private func ensureRenderer() throws -> MetalRenderer {
    if let renderer = renderer { return renderer }
    if rendererFailed { throw RendererError.noMetalDevice }
    do {
      let created = try MetalRenderer(bundle: Bundle(for: SceneProcessor.self))
      renderer = created
      return created
    } catch {
      rendererFailed = true
      throw error
    }
  }

  private func process(_ frame: RTCVideoFrame) throws -> RTCVideoFrame {
    let layers = SceneLayers.get()
    if layers.isEmpty {
      // No scene spec delivered yet (or it was cleared). Forward the original.
      return frame
    }

    guard let input = FrameBridge.inputPixelBuffer(frame) else {
      return frame
    }
    let bufferW = CVPixelBufferGetWidth(input)
    let bufferH = CVPixelBufferGetHeight(input)
    guard bufferW > 0, bufferH > 0 else { return frame }

    let renderer = try ensureRenderer()

    // Step 1: ingest NV12 -> DISPLAY-UPRIGHT "original" BGRA texture.
    let rotation = frame.rotation.rawValue
    let width = Ingest.displayWidth(bufferWidth: bufferW, bufferHeight: bufferH, rotation: rotation)
    let height = Ingest.displayHeight(bufferWidth: bufferW, bufferHeight: bufferH, rotation: rotation)
    let (originalBuffer, originalTexture, originalWrapper) = try renderer.originalIngestTarget(
      width: width, height: height
    )
    try TextureBridge.ingest(input: input, into: originalBuffer, frameRotation: rotation)

    // Step 2: mask, only if a subject layer is present. Unlike the single-effect
    // processors (which forward the original until a mask warms up), a scene's
    // BACKGROUND layers are mask-independent, so we composite the scene regardless
    // and skip ONLY the subject layer when no mask has completed yet — mirroring
    // SceneFactory, which draws the rest of the stack and skips the subject on
    // maskTexId == -1. Always kick a new segmentation if idle so the mask keeps
    // refreshing.
    let needsSubject = layers.contains { $0.target == "subject" }
    var maskTexture: MTLTexture?
    var maskWrapper: CVMetalTexture?
    var maskBuffer: CVPixelBuffer?
    if needsSubject {
      segmenter.kickIfIdle(input: originalBuffer)
      if let buffer = segmenter.latestMask() {
        let (texture, wrapper) = try TextureBridge.makeTexture(
          from: buffer, cache: renderer.textureCache, pixelFormat: .r8Unorm, planeIndex: 0
        )
        maskBuffer = buffer
        maskTexture = texture
        maskWrapper = wrapper
      }
      // maskTexture stays nil until the first mask completes; the subject layer is
      // skipped those frames (drawLayer guards on a non-nil mask).
    }

    // Anchor the monotonic clock at first frame; uTime is seconds since then.
    let now = CACurrentMediaTime()
    if startTime == nil { startTime = now }
    let elapsed = Float(now - (startTime ?? now))

    let (maskLo, maskHi) = MaskTuning.smoothstepRange(
      hardness: EffectTuning.maskHardness,
      threshold: EffectTuning.maskThreshold
    )

    // Step 3: composite every layer into the output buffer's texture in one pass.
    let output = try renderer.dequeueOutputBuffer(width: width, height: height)
    let (outputTexture, outputWrapper) = try TextureBridge.makeTexture(
      from: output, cache: renderer.textureCache, pixelFormat: .bgra8Unorm, planeIndex: 0
    )

    let commandBuffer = try renderer.makeCommandBuffer()
    commandBuffer.label = "Kaleidoscope.Scene"

    let encoder = try renderer.beginSceneEncoder(
      commandBuffer: commandBuffer, target: outputTexture, label: "scene-composite"
    )
    for (index, layer) in layers.enumerated() {
      let blend = blendFor(isBase: index == 0, blend: layer.blend)
      drawLayer(
        encoder: encoder, renderer: renderer, layer: layer, blend: blend,
        width: width, height: height, elapsed: elapsed,
        camera: originalTexture, mask: maskTexture,
        maskLo: maskLo, maskHi: maskHi
      )
    }
    encoder.endEncoding()

    // Step 4: R3 frame-pipelining. keepAlive holds the per-frame inputs the
    // in-flight GPU command buffer still reads after process() returns: the
    // pooled original buffer + wrapper, the output wrapper, and (when a subject
    // layer ran) the mask buffer + wrapper. Plate textures are loaded once via
    // MTKTextureLoader and cached on this instance (.private, not pool buffers),
    // so they need no keep-alive, same as BackgroundImageProcessor's background.
    var keepAlive: [Any] = [originalBuffer, originalWrapper, outputWrapper]
    if let maskBuffer = maskBuffer { keepAlive.append(maskBuffer) }
    if let maskWrapper = maskWrapper { keepAlive.append(maskWrapper) }

    guard let ready = renderer.commitPipelined(
      commandBuffer,
      currentOutput: output,
      keepAlive: keepAlive,
      debugTiming: EffectTuning.debugTiming,
      timingLabel: "scene"
    ) else {
      return frame
    }

    return FrameBridge.makeOutputFrame(pixelBuffer: ready, like: frame)
  }

  // Map (isBase, blend string) to a SceneBlend. Base is opaque; "additive" maps
  // to add; everything else (nil, "normal") maps to premultiplied over. Mirrors
  // SceneFactory.applyBlend.
  private func blendFor(isBase: Bool, blend: String?) -> MetalRenderer.SceneBlend {
    if isBase { return .opaqueBase }
    if blend == "additive" { return .additive }
    return .over
  }

  // Draw one layer into the open scene encoder at the given blend. Any failure to
  // build a pipeline / load a plate / compile a generative shader skips THIS
  // layer (logged once) rather than aborting the frame, so a partial scene still
  // composites — mirroring SceneFactory's per-layer skips.
  private func drawLayer(
    encoder: MTLRenderCommandEncoder,
    renderer: MetalRenderer,
    layer: SceneLayer,
    blend: MetalRenderer.SceneBlend,
    width: Int,
    height: Int,
    elapsed: Float,
    camera: MTLTexture,
    mask: MTLTexture?,
    maskLo: Float,
    maskHi: Float
  ) {
    switch layer.shader {
    case "image":
      drawImageLayer(encoder: encoder, renderer: renderer, layer: layer,
                     blend: blend, width: width, height: height)
    case "direct":
      // Passthrough. On the subject that is the masked person; on the background
      // it is a no-op (nothing to pass through but the stack). Skipped if the
      // mask is unavailable (step 2 already forwarded the original in that case,
      // so `mask` is non-nil here whenever a subject layer exists).
      if layer.target == "subject", let mask = mask {
        drawSubjectLayer(encoder: encoder, renderer: renderer, blend: blend,
                         camera: camera, mask: mask, maskLo: maskLo, maskHi: maskHi)
      }
    default:
      // A generative layer. Stenciling one to the subject is a later step; for
      // now generative layers run on the background only (mirrors web/Android).
      if layer.target != "subject" {
        drawGenerativeLayer(encoder: encoder, renderer: renderer, layer: layer,
                            blend: blend, width: width, height: height, elapsed: elapsed)
      }
    }
  }

  private func drawImageLayer(
    encoder: MTLRenderCommandEncoder,
    renderer: MetalRenderer,
    layer: SceneLayer,
    blend: MetalRenderer.SceneBlend,
    width: Int,
    height: Int
  ) {
    guard let id = layer.source else {
      os_log("image layer has no source id; skipping", log: SceneProcessor.log, type: .info)
      return
    }
    guard let plate = ensurePlateTexture(id: id, device: renderer.device) else { return }
    guard let fragment = ensureImageFragment(renderer: renderer) else { return }
    guard let pipeline = ensurePipeline(
      fragment: fragment, fragmentLabel: "scene-image", blend: blend, renderer: renderer
    ) else { return }
    let coverScale = coverScale(outW: width, outH: height, imgAspect: plate.aspect)
    renderer.drawSceneImageLayer(
      encoder: encoder, pipeline: pipeline, plate: plate.texture, coverScale: coverScale
    )
  }

  private func drawSubjectLayer(
    encoder: MTLRenderCommandEncoder,
    renderer: MetalRenderer,
    blend: MetalRenderer.SceneBlend,
    camera: MTLTexture,
    mask: MTLTexture,
    maskLo: Float,
    maskHi: Float
  ) {
    guard let fragment = ensureSubjectFragment(renderer: renderer) else { return }
    guard let pipeline = ensurePipeline(
      fragment: fragment, fragmentLabel: "scene-subject", blend: blend, renderer: renderer
    ) else { return }
    // iOS mask is aligned with the camera FBO (the Segmenter's flip bracket), so
    // identity mask UV, matching the background-image / blur composites — unlike
    // web's V-flip.
    renderer.drawSceneSubjectLayer(
      encoder: encoder, pipeline: pipeline, camera: camera, mask: mask,
      maskUvScale: SIMD2<Float>(1, 1), maskUvOffset: SIMD2<Float>(0, 0),
      maskLo: maskLo, maskHi: maskHi
    )
  }

  private func drawGenerativeLayer(
    encoder: MTLRenderCommandEncoder,
    renderer: MetalRenderer,
    layer: SceneLayer,
    blend: MetalRenderer.SceneBlend,
    width: Int,
    height: Int,
    elapsed: Float
  ) {
    guard let (fragment, indices) = ensureGenerative(name: layer.shader, renderer: renderer) else {
      return
    }
    guard let pipeline = ensurePipeline(
      fragment: fragment, fragmentLabel: layer.shader, blend: blend, renderer: renderer
    ) else { return }
    let builtins = makeBuiltinBindings(indices: indices, elapsed: elapsed, width: width, height: height)
    let uniforms = makeUniformBindings(indices: indices, layer: layer)
    renderer.drawSceneGenerativeLayer(
      encoder: encoder, pipeline: pipeline, builtinBindings: builtins, uniformBindings: uniforms
    )
  }

  // MARK: - Pipeline / fragment caches

  private func ensurePipeline(
    fragment: MTLFunction,
    fragmentLabel: String,
    blend: MetalRenderer.SceneBlend,
    renderer: MetalRenderer
  ) -> MTLRenderPipelineState? {
    let key = "\(fragmentLabel)|\(blend)"
    if let cached = pipelineCache[key] { return cached }
    do {
      let pipeline = try renderer.makeSceneLayerPipeline(
        fragment: fragment, blend: blend, label: "scene-\(key)"
      )
      pipelineCache[key] = pipeline
      return pipeline
    } catch {
      os_log("scene pipeline %{public}@ build failed: %{public}@",
             log: SceneProcessor.log, type: .error, key, error.localizedDescription)
      return nil
    }
  }

  private func ensureImageFragment(renderer: MetalRenderer) -> MTLFunction? {
    if let fragment = imageFragment { return fragment }
    if imageFailed { return nil }
    do {
      let library = try ShaderLibrary(
        device: renderer.device, bundle: Bundle(for: SceneProcessor.self), fileName: "scene-image"
      )
      let fragment = try library.function()
      imageFragment = fragment
      return fragment
    } catch {
      imageFailed = true
      os_log("scene-image fragment build failed: %{public}@",
             log: SceneProcessor.log, type: .error, error.localizedDescription)
      return nil
    }
  }

  private func ensureSubjectFragment(renderer: MetalRenderer) -> MTLFunction? {
    if let fragment = subjectFragment { return fragment }
    if subjectFailed { return nil }
    do {
      let library = try ShaderLibrary(
        device: renderer.device, bundle: Bundle(for: SceneProcessor.self), fileName: "scene-subject"
      )
      let fragment = try library.function()
      subjectFragment = fragment
      return fragment
    } catch {
      subjectFailed = true
      os_log("scene-subject fragment build failed: %{public}@",
             log: SceneProcessor.log, type: .error, error.localizedDescription)
      return nil
    }
  }

  // Build-or-return a generative layer fragment + its uniform-index map. Compiles
  // `<name>.metalsrc` into its own MTLLibrary and parses the buffer-index
  // decorations, exactly like ShaderProcessor.ensureGenerative. Caches success
  // and failure so an unknown/broken layer shader degrades to a skipped layer
  // without recompiling per frame.
  private func ensureGenerative(
    name: String, renderer: MetalRenderer
  ) -> (fragment: MTLFunction, indices: [String: Int])? {
    if let fragment = generativeFragments[name] {
      return (fragment, generativeUniformIndices[name] ?? [:])
    }
    if generativeFailed.contains(name) { return nil }
    do {
      let library = try ShaderLibrary(
        device: renderer.device, bundle: Bundle(for: SceneProcessor.self), fileName: name
      )
      let fragment = try library.function()
      let indices = library.uniformBufferIndices()
      generativeFragments[name] = fragment
      generativeUniformIndices[name] = indices
      os_log("scene generative layer %{public}@ compiled; uniform indices: %{public}@",
             log: SceneProcessor.log, type: .info, name, String(describing: indices))
      return (fragment, indices)
    } catch {
      generativeFailed.insert(name)
      os_log("scene generative layer %{public}@ build failed: %{public}@",
             log: SceneProcessor.log, type: .error, name, error.localizedDescription)
      return nil
    }
  }

  // MARK: - Uniform bindings (mirror ShaderProcessor)

  private func makeBuiltinBindings(
    indices: [String: Int], elapsed: Float, width: Int, height: Int
  ) -> [(index: Int, value: [Float])] {
    var bindings = [(index: Int, value: [Float])]()
    if let i = indices["uTime"] { bindings.append((index: i, value: [elapsed])) }
    if let i = indices["uResolution"] {
      bindings.append((index: i, value: [Float(width), Float(height)]))
    }
    return bindings
  }

  // Bind each JS-set layer uniform by name -> buffer index. float3 is PADDED to
  // 16 bytes (a Metal `constant float3&` argument occupies 16 bytes); see the
  // detailed rationale on ShaderProcessor.makeUniformBindings.
  private func makeUniformBindings(
    indices: [String: Int], layer: SceneLayer
  ) -> [(index: Int, value: [Float])] {
    var bindings = [(index: Int, value: [Float])]()
    for (name, values) in layer.uniforms {
      if SceneProcessor.builtinNames.contains(name) { continue }
      guard let index = indices[name] else { continue }
      switch values.count {
      case 1, 2, 4:
        bindings.append((index: index, value: values))
      case 3:
        bindings.append((index: index, value: [values[0], values[1], values[2], 0]))
      default:
        os_log("scene layer %{public}@ uniform %{public}@ has unsupported length %d; skipping",
               log: SceneProcessor.log, type: .info, layer.shader, name, values.count)
      }
    }
    return bindings
  }

  // MARK: - Plate loading

  /// Resolve a scene plate `<id>.webp`. The iOS prebuild copies scene plates into
  /// the app target's resources under scene-plates/<id>.webp (see app.plugin.js's
  /// copyIosScenePlates), so it lands in Bundle.main; fall back to the
  /// Kaleidoscope resource bundle's scene-plates/ for a test/static layout.
  /// Mirrors BackgroundImageProcessor.bundledURL but in the scene-plates subdir.
  static func plateURL(for id: String) -> URL? {
    let containing = Bundle(for: SceneProcessor.self)
    let resourceBundle = Bundle.kaleidoscopeResources(relativeTo: containing) ?? containing
    return Bundle.main.url(forResource: id, withExtension: "webp", subdirectory: scenePlatesSubdir)
      ?? Bundle.main.url(forResource: id, withExtension: "webp")
      ?? resourceBundle.url(forResource: id, withExtension: "webp", subdirectory: scenePlatesSubdir)
      ?? resourceBundle.url(forResource: id, withExtension: "webp")
  }

  /// Lazy-load the plate WebP as a Metal texture via MTKTextureLoader (decoded by
  /// ImageIO, which supports WebP on iOS 14+; the podspec floors iOS 15). Cached
  /// per id; a failed load is remembered. The texture loads top-left origin like
  /// BackgroundImageProcessor's background; the V-flip parity is folded into the
  /// cover-scale at draw time (see coverScale).
  private func ensurePlateTexture(id: String, device: MTLDevice) -> PlateTexture? {
    if let plate = plateTextures[id] { return plate }
    if missingPlates.contains(id) { return nil }
    guard let url = SceneProcessor.plateURL(for: id) else {
      os_log("scene plate %{public}@.webp not found in app bundle or Kaleidoscope.bundle",
             log: SceneProcessor.log, type: .error, id)
      missingPlates.insert(id)
      return nil
    }
    let loader = MTKTextureLoader(device: device)
    let options: [MTKTextureLoader.Option: Any] = [
      .origin: MTKTextureLoader.Origin.topLeft,
      .SRGB: false,
      .textureUsage: NSNumber(value: MTLTextureUsage.shaderRead.rawValue),
      .textureStorageMode: NSNumber(value: MTLStorageMode.private.rawValue),
    ]
    do {
      let texture = try loader.newTexture(URL: url, options: options)
      let aspect = Float(texture.width) / Float(max(texture.height, 1))
      let plate = PlateTexture(texture: texture, aspect: aspect)
      plateTextures[id] = plate
      os_log("scene plate %{public}@ loaded: %dx%d aspect=%.3f",
             log: SceneProcessor.log, type: .info, id, texture.width, texture.height, aspect)
      return plate
    } catch {
      missingPlates.insert(id)
      os_log("scene plate %{public}@ load failed: %{public}@",
             log: SceneProcessor.log, type: .error, id, error.localizedDescription)
      return nil
    }
  }

  // Center-crop cover-fit UV scale (mirrors coverScale in scene.ts / SceneFactory),
  // with the V axis NEGATED to fold in the MTKTextureLoader V-flip parity. The
  // scene-image fragment computes uv = (vUv - 0.5) * coverScale + 0.5; a negative
  // y reflects about the crop window's center, so the plate lands semantic-top at
  // vUv.y=1, matching the CoreImage-rendered camera "original" (which composites
  // correct on-device). This is the same texture-origin parity fix
  // BackgroundImageProcessor applies on uBgUvScale.y; here the cover-scale IS the
  // sampling scale (the fragment centers it about 0.5), so a single -y suffices
  // and stays centered for both letterbox branches. Camera orientation is handled
  // at ingest and is independent of this term. RISK: parity is reasoned, not
  // device-verified on iOS; if a plate renders vertically inverted, this -sy is
  // the single term to flip back to +sy.
  private func coverScale(outW: Int, outH: Int, imgAspect: Float) -> SIMD2<Float> {
    let outAspect = Float(outW) / Float(outH)
    let sx: Float
    let sy: Float
    if outAspect > imgAspect {
      sx = 1
      sy = imgAspect / outAspect
    } else {
      sx = outAspect / imgAspect
      sy = 1
    }
    return SIMD2<Float>(sx, -sy)
  }
}
