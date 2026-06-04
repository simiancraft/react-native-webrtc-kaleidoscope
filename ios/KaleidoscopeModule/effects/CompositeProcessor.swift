// iOS composite compositor. Mirrors android/.../effects/CompositeFactory.kt on the iOS
// Metal pipeline.
//
// The multi-layer generalization of ShaderProcessor: a composite is an ordered
// painter's stack of layers (CompositeLayers, delivered from JS via setCompositeLayers),
// composited into ONE output texture, layer 0 opaque, later layers blended over.
// One processor instance serves EVERY composite; the layer stack is data, swapped
// from JS as the active composite changes, so adding a composite needs no Swift change.
//
// Per frame (builds on BackgroundImageProcessor / ShaderProcessor):
//   1. Ingest the camera CVPixelBuffer (NV12) into the DISPLAY-UPRIGHT "original"
//      BGRA Metal texture via CoreImage (Ingest.swift), as elsewhere.
//   2. If any layer targets the subject, read the latest mask (Segmenter). The
//      composite's BACKGROUND layers are mask-independent, so the composite composites
//      every frame and ONLY the subject layer is skipped until a mask has
//      completed (mirroring CompositeFactory drawing the rest of the stack and
//      skipping the subject on maskTexId == -1). Kick a new segmentation when
//      idle.
//   3. Composite every layer into the output buffer's BGRA texture. Each layer's
//      OUTPUT draw is its own composite encoder (the first actual draw clears to
//      opaque black, establishing the base; later draws `.load` and blend with
//      premultiplied over (normal) or add (additive)). A scratch-backed layer
//      renders its content into a .private scratch texture in a SEPARATE pass
//      first. Per layer kind (mirrors the generalized composite.ts / CompositeFactory):
//        - 'image'/background  : cover-fit the image (composite-image.metalsrc).
//        - 'direct'/background : raw camera fullscreen (composite-camera.metalsrc).
//        - 'blur'/background   : two-pass camera-sampling gaussian
//                     (composite-blur.metalsrc) into scratchA->scratchB, then blit
//                     (composite-blit.metalsrc).
//        - generative/background : render its frag (the layer .metalsrc, generic
//                     uniform-by-name binding) with uTime/uResolution + uniforms.
//        - 'direct'/subject    : the masked person (composite-subject.metalsrc).
//        - ANY other layer / subject : render the layer to a scratch, then a
//                     masked-composite (composite-masked.metalsrc) multiplies it by
//                     the mask alpha. So generative/blur/image can target subject.
//      Subject layers are skipped until a mask has completed (step 2).
//   4. Hand off via R3 frame-pipelining (commitPipelined), returning the PREVIOUS
//      completed frame, exactly like the other processors.
//
// One instance, shared across every frame, so all mutable state is guarded by an
// os_unfair_lock. Every failure path logs under Kaleidoscope.Composite and returns
// the ORIGINAL frame; the processor must never crash the capture pipeline.

import CoreVideo
import Foundation
import Metal
import MetalKit
import os.log
import QuartzCore
import simd
import WebRTC
#if canImport(livekit_react_native_webrtc)
    import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
    import react_native_webrtc
#endif

@objc(KaleidoscopeCompositeProcessor)
public final class CompositeProcessor: NSObject, VideoFrameProcessorDelegate {
    private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Composite")

    private var unsafeLock = os_unfair_lock_s()
    private var renderer: MetalRenderer?
    private var rendererFailed = false
    private let segmenter = Segmenter()

    // Fixed (non-generative) layer fragments, compiled once. Each lives in its own
    // .metalsrc; the output-drawing ones (image, subject, camera, blit, masked) need
    // the three blend variants (opaque base, over, additive), cached by blend mode.
    // The blur fragment runs into a scratch with blend OFF (its own .dontCare pass),
    // so it needs a plain generative-style pipeline, not a blend variant.
    private var imageFragment: MTLFunction?
    private var subjectFragment: MTLFunction?
    private var cameraFragment: MTLFunction?
    private var blitFragment: MTLFunction?
    private var maskedFragment: MTLFunction?
    private var blurFragment: MTLFunction?
    private var blurPipeline: MTLRenderPipelineState?
    private var imageFailed = false
    private var subjectFailed = false
    private var cameraFailed = false
    private var blitFailed = false
    private var maskedFailed = false
    private var blurFailed = false

    // Buffer-index maps for the fixed fragments that bind by NAME (resolved from the
    // transpiled .metalsrc via ShaderLibrary.uniformBufferIndices) instead of
    // hardcoded positions, so a spirv-cross re-order can't silently swap a uniform.
    // Populated alongside the fragment in the matching ensure*Fragment.
    private var subjectUniformIndices: [String: Int] = [:]
    private var maskedUniformIndices: [String: Int] = [:]

    /// Pipeline-state cache keyed by "<fragment label>|<blend>". Image, subject, and
    /// each generative shader get one pipeline per blend mode used. Built lazily.
    private var pipelineCache = [String: MTLRenderPipelineState]()

    // Generative layer fragments + their uniform-index maps, cached by shader name
    // (mirrors ShaderProcessor.ensureGenerative). A failed build is remembered so
    // we don't recompile per frame.
    private var generativeFragments = [String: MTLFunction]()
    private var generativeUniformIndices = [String: [String: Int]]()
    private var generativeFailed = Set<String>()

    // Image textures by id, loaded lazily on first use; cached for the session.
    // Each entry carries the source aspect for cover-fit. A failed load is
    // remembered so we don't re-read the bundle every frame.
    private var imageTextures = [String: ImageTexture]()
    private var missingImages = Set<String>()

    /// Host monotonic clock origin for uTime (CACurrentMediaTime; see ShaderProcessor).
    private var startTime: CFTimeInterval?

    private static let builtinNames: Set<String> = ["uTime", "uResolution"]
    private static let imagesSubdir = "images"

    private struct ImageTexture {
        let texture: MTLTexture
        let aspect: Float
    }

    @objc override public init() {
        super.init()
    }

    @objc(capturer:didCaptureVideoFrame:)
    public func capturer(
        _: RTCVideoCapturer,
        didCapture frame: RTCVideoFrame
    ) -> RTCVideoFrame {
        os_unfair_lock_lock(&unsafeLock)
        defer { os_unfair_lock_unlock(&unsafeLock) }
        do {
            return try process(frame)
        } catch {
            os_log("composite failed; forwarding original. %{public}@",
                   log: CompositeProcessor.log, type: .error, error.localizedDescription)
            return frame
        }
    }

    private func ensureRenderer() throws -> MetalRenderer {
        if let renderer { return renderer }
        if rendererFailed { throw RendererError.noMetalDevice }
        do {
            let created = try MetalRenderer(bundle: Bundle(for: CompositeProcessor.self))
            renderer = created
            return created
        } catch {
            rendererFailed = true
            throw error
        }
    }

    private func process(_ frame: RTCVideoFrame) throws -> RTCVideoFrame {
        let layers = CompositeLayers.get()
        if layers.isEmpty {
            // No composite spec delivered yet (or it was cleared). Forward the original.
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
        // processors (which forward the original until a mask warms up), a composite's
        // BACKGROUND layers are mask-independent, so we composite the stack regardless
        // and skip ONLY the subject layer when no mask has completed yet; mirroring
        // CompositeFactory, which draws the rest of the stack and skips the subject on
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
        commandBuffer.label = "Kaleidoscope.Composite"

        // Composite the stack into the output texture. Unlike a single open encoder
        // for the whole stack, each layer's OUTPUT draw gets its own composite encoder:
        // the base opens `.clear` (opaque black), later layers open `.load`
        // (preserve the running composite). A scratch-backed layer (blur, or any
        // non-direct subject layer) renders its content into a .private scratch in a
        // SEPARATE pass first, then the output encoder samples it. Two encoders
        // cannot be open at once on one command buffer, so the per-layer-encoder
        // shape is what lets the scratch passes interleave. Mirrors the GL "bind
        // output FBO, set blend, draw" the other platforms repeat per layer.
        var isFirstOutputDraw = true
        for (index, layer) in layers.enumerated() {
            let blend = blendFor(isBase: index == 0, blend: layer.blend)
            drawLayer(
                commandBuffer: commandBuffer, renderer: renderer, layer: layer, blend: blend,
                isFirstOutputDraw: &isFirstOutputDraw,
                outputTexture: outputTexture, width: width, height: height, elapsed: elapsed,
                camera: originalTexture, mask: maskTexture,
                maskLo: maskLo, maskHi: maskHi
            )
        }
        // If NO layer produced an output draw (e.g. a single subject layer with no
        // mask yet), the output texture was never cleared. Clear it to opaque black
        // so the frame is defined rather than reading the pooled buffer's stale
        // contents. A cheap clear-only pass.
        if isFirstOutputDraw {
            let clearEncoder = try renderer.beginCompositeEncoder(
                commandBuffer: commandBuffer, target: outputTexture, clear: true, label: "composite-clear"
            )
            clearEncoder.endEncoding()
        }

        // Step 4: R3 frame-pipelining. keepAlive holds the per-frame inputs the
        // in-flight GPU command buffer still reads after process() returns: the
        // pooled original buffer + wrapper, the output wrapper, and (when a subject
        // layer ran) the mask buffer + wrapper. Image textures are loaded once via
        // MTKTextureLoader and cached on this instance (.private, not pool buffers),
        // so they need no keep-alive, same as BackgroundImageProcessor's background.
        var keepAlive: [Any] = [originalBuffer, originalWrapper, outputWrapper]
        if let maskBuffer { keepAlive.append(maskBuffer) }
        if let maskWrapper { keepAlive.append(maskWrapper) }

        guard let ready = renderer.commitPipelined(
            commandBuffer,
            currentOutput: output,
            keepAlive: keepAlive,
            debugTiming: EffectTuning.debugTiming,
            timingLabel: "composite"
        ) else {
            return frame
        }

        return FrameBridge.makeOutputFrame(pixelBuffer: ready, like: frame)
    }

    /// Map (isBase, blend string) to a CompositeBlend. Base is opaque; "additive" maps
    /// to add; everything else (nil, "normal") maps to premultiplied over. Mirrors
    /// CompositeFactory.applyBlend.
    private func blendFor(isBase: Bool, blend: String?) -> MetalRenderer.CompositeBlend {
        if isBase { return .opaqueBase }
        if blend == "additive" { return .additive }
        return .over
    }

    /// The per-pass V parity a scratch carries (see the V-FLIP reasoning at the top
    /// of renderContentToScratch). A single-pass scratch (image / generative) is
    /// V-flipped relative to a direct draw; a two-pass blur scratch is not.
    private static let scratchOddParity =
        (scale: SIMD2<Float>(1, -1), offset: SIMD2<Float>(0, 1))
    private static let scratchEvenParity =
        (scale: SIMD2<Float>(1, 1), offset: SIMD2<Float>(0, 0))

    // Composite one layer onto the output. Mirrors the per-layer body of composite.ts /
    // CompositeFactory.drawLayer: a 'subject' layer is mask-stenciled (direct takes the
    // one-pass cam x mask fast path; any other shader renders to a scratch then a
    // masked-composite multiplies by the mask alpha), a 'background' layer draws
    // fullscreen (image cover-fit, direct raw camera, blur the two-pass gaussian,
    // generative its frag). Any failure to build a pipeline / load a image / compile
    // a shader skips THIS layer (logged once) rather than aborting the frame, so a
    // partial composite still composites; mirroring CompositeFactory's per-layer skips.
    //
    // Each output draw opens its OWN composite encoder (clear on the first actual draw,
    // load after); scratch-backed layers render their content in a separate pass
    // first. `isFirstOutputDraw` is inout so the FIRST layer that actually draws
    // clears the output (establishing the opaque base) even if the declared base
    // layer was skipped (e.g. a subject layer with no mask yet).
    private func drawLayer(
        commandBuffer: MTLCommandBuffer,
        renderer: MetalRenderer,
        layer: CompositeLayer,
        blend: MetalRenderer.CompositeBlend,
        isFirstOutputDraw: inout Bool,
        outputTexture: MTLTexture,
        width: Int,
        height: Int,
        elapsed: Float,
        camera: MTLTexture,
        mask: MTLTexture?,
        maskLo: Float,
        maskHi: Float
    ) {
        if layer.target == "subject" {
            // Subject layers need the mask; skip until it warms up (mirrors web's
            // subjectReady guard / CompositeFactory's maskTexId == -1 skip).
            guard let mask else { return }
            if layer.shader == "direct" {
                // One-pass fast path: cam x mask.
                guard let subject = ensureSubjectFragment(renderer: renderer),
                      let pipeline = ensurePipeline(
                          fragment: subject.fragment, fragmentLabel: "composite-subject", blend: blend, renderer: renderer
                      ) else { return }
                withOutputEncoder(
                    commandBuffer: commandBuffer, renderer: renderer, outputTexture: outputTexture,
                    isFirstOutputDraw: &isFirstOutputDraw, label: "composite-subject-direct"
                ) { encoder in
                    // iOS mask is aligned with the camera (the Segmenter's flip bracket),
                    // so identity mask UV, unlike web's V-flip.
                    renderer.drawCompositeSubjectLayer(
                        encoder: encoder, pipeline: pipeline, indices: subject.indices,
                        camera: camera, mask: mask,
                        maskUvScale: SIMD2<Float>(1, 1), maskUvOffset: SIMD2<Float>(0, 0),
                        maskLo: maskLo, maskHi: maskHi
                    )
                }
                return
            }
            // Render the layer's content to a scratch, then stencil it through the mask.
            guard let content = renderContentToScratch(
                commandBuffer: commandBuffer, renderer: renderer, layer: layer,
                width: width, height: height, elapsed: elapsed, camera: camera
            ) else { return }
            guard let masked = ensureMaskedFragment(renderer: renderer),
                  let pipeline = ensurePipeline(
                      fragment: masked.fragment, fragmentLabel: "composite-masked", blend: blend, renderer: renderer
                  ) else { return }
            withOutputEncoder(
                commandBuffer: commandBuffer, renderer: renderer, outputTexture: outputTexture,
                isFirstOutputDraw: &isFirstOutputDraw, label: "composite-masked"
            ) { encoder in
                renderer.drawCompositeMaskedLayer(
                    encoder: encoder, pipeline: pipeline, indices: masked.indices,
                    content: content.texture, mask: mask,
                    maskUvScale: SIMD2<Float>(1, 1), maskUvOffset: SIMD2<Float>(0, 0),
                    maskLo: maskLo, maskHi: maskHi
                )
            }
            return
        }

        // Background layers draw fullscreen.
        switch layer.shader {
        case "image":
            guard let id = layer.source else {
                os_log("image layer has no source id; skipping", log: CompositeProcessor.log, type: .info)
                return
            }
            guard let image = ensureImageTexture(id: id, device: renderer.device),
                  let fragment = ensureImageFragment(renderer: renderer),
                  let pipeline = ensurePipeline(
                      fragment: fragment, fragmentLabel: "composite-image", blend: blend, renderer: renderer
                  ) else { return }
            let cover = coverScale(outW: width, outH: height, imgAspect: image.aspect)
            withOutputEncoder(
                commandBuffer: commandBuffer, renderer: renderer, outputTexture: outputTexture,
                isFirstOutputDraw: &isFirstOutputDraw, label: "composite-image"
            ) { encoder in
                renderer.drawCompositeImageLayer(
                    encoder: encoder, pipeline: pipeline, image: image.texture, coverScale: cover
                )
            }
        case "direct":
            // Raw camera fullscreen.
            guard let fragment = ensureCameraFragment(renderer: renderer),
                  let pipeline = ensurePipeline(
                      fragment: fragment, fragmentLabel: "composite-camera", blend: blend, renderer: renderer
                  ) else { return }
            withOutputEncoder(
                commandBuffer: commandBuffer, renderer: renderer, outputTexture: outputTexture,
                isFirstOutputDraw: &isFirstOutputDraw, label: "composite-camera"
            ) { encoder in
                renderer.drawCompositeCameraLayer(encoder: encoder, pipeline: pipeline, camera: camera)
            }
        case "blur":
            // Two-pass gaussian into a scratch, then blit the scratch to the output.
            guard let content = renderContentToScratch(
                commandBuffer: commandBuffer, renderer: renderer, layer: layer,
                width: width, height: height, elapsed: elapsed, camera: camera
            ) else { return }
            guard let fragment = ensureBlitFragment(renderer: renderer),
                  let pipeline = ensurePipeline(
                      fragment: fragment, fragmentLabel: "composite-blit", blend: blend, renderer: renderer
                  ) else { return }
            withOutputEncoder(
                commandBuffer: commandBuffer, renderer: renderer, outputTexture: outputTexture,
                isFirstOutputDraw: &isFirstOutputDraw, label: "composite-blit"
            ) { encoder in
                renderer.drawCompositeBlitLayer(
                    encoder: encoder, pipeline: pipeline, content: content.texture,
                    contentUvScale: content.uvScale, contentUvOffset: content.uvOffset
                )
            }
        default:
            // Generative background.
            guard let (fragment, indices) = ensureGenerative(name: layer.shader, renderer: renderer),
                  let pipeline = ensurePipeline(
                      fragment: fragment, fragmentLabel: layer.shader, blend: blend, renderer: renderer
                  ) else { return }
            let builtins = makeBuiltinBindings(indices: indices, elapsed: elapsed, width: width, height: height)
            let uniforms = makeUniformBindings(indices: indices, layer: layer)
            withOutputEncoder(
                commandBuffer: commandBuffer, renderer: renderer, outputTexture: outputTexture,
                isFirstOutputDraw: &isFirstOutputDraw, label: "composite-\(layer.shader)"
            ) { encoder in
                renderer.drawCompositeGenerativeLayer(
                    encoder: encoder, pipeline: pipeline, builtinBindings: builtins, uniformBindings: uniforms
                )
            }
        }
    }

    /// Open a one-layer output composite encoder, run `draw`, end it. The FIRST actual
    /// output draw clears the output to opaque black (establishing the base); every
    /// later draw loads the running composite so the pipeline's blend accumulates.
    /// `isFirstOutputDraw` flips false after the first real draw.
    private func withOutputEncoder(
        commandBuffer: MTLCommandBuffer,
        renderer: MetalRenderer,
        outputTexture: MTLTexture,
        isFirstOutputDraw: inout Bool,
        label: String,
        _ draw: (MTLRenderCommandEncoder) -> Void
    ) {
        do {
            let encoder = try renderer.beginCompositeEncoder(
                commandBuffer: commandBuffer, target: outputTexture,
                clear: isFirstOutputDraw, label: label
            )
            draw(encoder)
            encoder.endEncoding()
            isFirstOutputDraw = false
        } catch {
            os_log("composite output encoder %{public}@ failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, label, error.localizedDescription)
        }
    }

    /// Render a layer's content into a .private scratch texture (its own pass, blend
    /// off), returning the texture and the content-UV V-parity term the output draw
    /// must apply when it samples it. Mirrors renderContentToScratch in composite.ts /
    /// CompositeFactory.
    ///
    /// V-FLIP PARITY (RISK: reasoned, not device-verified): every Metal
    /// render-to-texture pass flips vertically in buffer space relative to a
    /// directly-sampled texture, because the transpiled passthrough vertex does not
    /// negate gl_Position.y (see MetalRenderer header; the BlurProcessor composite
    /// relies on the same property for its odd-pass blurred background). A layer
    /// drawn DIRECTLY into the output (image/camera/generative background) is one
    /// pass and lands correct. Routing a layer through a scratch adds passes:
    ///   - blur: camera -> scratchA (1) -> scratchB (2). TWO passes, EVEN parity, so
    ///     scratchB matches the camera orientation; the blit samples it with no V
    ///     flip (scratchEvenParity).
    ///   - image / generative to subject: ONE pass into scratchA, ODD parity, so the
    ///     masked-composite samples it V-flipped to undo the extra pass
    ///     (scratchOddParity). This restores the same orientation the layer would
    ///     have had drawn directly (the composite-image -sy cover term included).
    /// If a subject generative/image renders vertically inverted on device, flip the
    /// scratchOddParity term to even (and vice-versa); that single constant is the
    /// calibration knob, exactly like BlurProcessor's bgUvScale.
    private func renderContentToScratch(
        commandBuffer: MTLCommandBuffer,
        renderer: MetalRenderer,
        layer: CompositeLayer,
        width: Int,
        height: Int,
        elapsed: Float,
        camera: MTLTexture
    ) -> (texture: MTLTexture, uvScale: SIMD2<Float>, uvOffset: SIMD2<Float>)? {
        let scratch: (MTLTexture, MTLTexture)
        do {
            scratch = try renderer.compositeScratch(width: width, height: height)
        } catch {
            os_log("composite scratch alloc failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, error.localizedDescription)
            return nil
        }
        let (scratchA, scratchB) = scratch

        if layer.shader == "blur" {
            guard let fragment = ensureBlurFragment(renderer: renderer),
                  let pipeline = ensureBlurPipeline(fragment: fragment, renderer: renderer)
            else {
                return nil
            }
            let sigma = layer.uniforms["sigma"]?.first ?? 4
            do {
                // Horizontal pass: camera -> scratchA.
                try renderer.encodeCompositeBlurPass(
                    commandBuffer: commandBuffer, pipeline: pipeline, source: camera, target: scratchA,
                    dir: SIMD2<Float>(1 / Float(width), 0), sigma: sigma, label: "composite-blur-h"
                )
                // Vertical pass: scratchA -> scratchB.
                try renderer.encodeCompositeBlurPass(
                    commandBuffer: commandBuffer, pipeline: pipeline, source: scratchA, target: scratchB,
                    dir: SIMD2<Float>(0, 1 / Float(height)), sigma: sigma, label: "composite-blur-v"
                )
            } catch {
                os_log("composite blur pass failed: %{public}@",
                       log: CompositeProcessor.log, type: .error, error.localizedDescription)
                return nil
            }
            return (scratchB, CompositeProcessor.scratchEvenParity.scale, CompositeProcessor.scratchEvenParity.offset)
        }

        // image / generative: render once into scratchA (blend off, cleared).
        if layer.shader == "image" {
            guard let id = layer.source else {
                os_log("image layer has no source id; skipping", log: CompositeProcessor.log, type: .info)
                return nil
            }
            guard let image = ensureImageTexture(id: id, device: renderer.device),
                  let fragment = ensureImageFragment(renderer: renderer),
                  let pipeline = ensurePipeline(
                      fragment: fragment, fragmentLabel: "composite-image",
                      blend: .opaqueBase, renderer: renderer
                  ) else { return nil }
            let cover = coverScale(outW: width, outH: height, imgAspect: image.aspect)
            do {
                try renderer.drawFullscreen(
                    commandBuffer: commandBuffer, pipeline: pipeline, target: scratchA, label: "composite-image-scratch"
                ) { encoder in
                    var coverVar = cover
                    encoder.setFragmentBytes(&coverVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
                    encoder.setFragmentTexture(image.texture, index: 0)
                    encoder.setFragmentSamplerState(renderer.linearClampSampler, index: 0)
                }
            } catch {
                os_log("composite image scratch failed: %{public}@",
                       log: CompositeProcessor.log, type: .error, error.localizedDescription)
                return nil
            }
            return (scratchA, CompositeProcessor.scratchOddParity.scale, CompositeProcessor.scratchOddParity.offset)
        }

        // Generative.
        guard let (fragment, indices) = ensureGenerative(name: layer.shader, renderer: renderer),
              let pipeline = ensurePipeline(
                  fragment: fragment, fragmentLabel: layer.shader, blend: .opaqueBase, renderer: renderer
              ) else { return nil }
        let builtins = makeBuiltinBindings(indices: indices, elapsed: elapsed, width: width, height: height)
        let uniforms = makeUniformBindings(indices: indices, layer: layer)
        do {
            try renderer.encodeGenerative(
                commandBuffer: commandBuffer, pipeline: pipeline, target: scratchA,
                builtinBindings: builtins, uniformBindings: uniforms, label: "composite-\(layer.shader)-scratch"
            )
        } catch {
            os_log("composite generative scratch failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, error.localizedDescription)
            return nil
        }
        return (scratchA, CompositeProcessor.scratchOddParity.scale, CompositeProcessor.scratchOddParity.offset)
    }

    // MARK: - Pipeline / fragment caches

    private func ensurePipeline(
        fragment: MTLFunction,
        fragmentLabel: String,
        blend: MetalRenderer.CompositeBlend,
        renderer: MetalRenderer
    ) -> MTLRenderPipelineState? {
        let key = "\(fragmentLabel)|\(blend)"
        if let cached = pipelineCache[key] { return cached }
        do {
            let pipeline = try renderer.makeCompositeLayerPipeline(
                fragment: fragment, blend: blend, label: "composite-\(key)"
            )
            pipelineCache[key] = pipeline
            return pipeline
        } catch {
            os_log("composite pipeline %{public}@ build failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, key, error.localizedDescription)
            return nil
        }
    }

    private func ensureImageFragment(renderer: MetalRenderer) -> MTLFunction? {
        if let fragment = imageFragment { return fragment }
        if imageFailed { return nil }
        do {
            let library = try ShaderLibrary(
                device: renderer.device, bundle: Bundle(for: CompositeProcessor.self), fileName: "composite-image"
            )
            let fragment = try library.function()
            imageFragment = fragment
            return fragment
        } catch {
            imageFailed = true
            os_log("composite-image fragment build failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, error.localizedDescription)
            return nil
        }
    }

    private func ensureSubjectFragment(
        renderer: MetalRenderer
    ) -> (fragment: MTLFunction, indices: [String: Int])? {
        if let fragment = subjectFragment { return (fragment, subjectUniformIndices) }
        if subjectFailed { return nil }
        do {
            let library = try ShaderLibrary(
                device: renderer.device, bundle: Bundle(for: CompositeProcessor.self), fileName: "composite-subject"
            )
            let fragment = try library.function()
            subjectFragment = fragment
            subjectUniformIndices = library.uniformBufferIndices()
            return (fragment, subjectUniformIndices)
        } catch {
            subjectFailed = true
            os_log("composite-subject fragment build failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, error.localizedDescription)
            return nil
        }
    }

    /// The raw-camera (direct/background) fragment, compiled once from its
    /// hand-authored .metalsrc and cached on success/failure exactly like the
    /// image/subject fragments. The blit and masked-composite fragments load
    /// through ensureBlitFragment / ensureMaskedFragment below.
    private func ensureCameraFragment(renderer: MetalRenderer) -> MTLFunction? {
        if let fragment = cameraFragment { return fragment }
        if cameraFailed { return nil }
        if let fragment = loadFixedFragment(fileName: "composite-camera", renderer: renderer) {
            cameraFragment = fragment
            return fragment
        }
        cameraFailed = true
        return nil
    }

    /// The scratch-blit fragment (blur/background); compiled once and cached on
    /// success/failure, same pattern as ensureCameraFragment.
    private func ensureBlitFragment(renderer: MetalRenderer) -> MTLFunction? {
        if let fragment = blitFragment { return fragment }
        if blitFailed { return nil }
        if let fragment = loadFixedFragment(fileName: "composite-blit", renderer: renderer) {
            blitFragment = fragment
            return fragment
        }
        blitFailed = true
        return nil
    }

    /// The masked-composite fragment (stencil any layer to the subject); compiled
    /// once and cached on success/failure, with its uniform-index map resolved from
    /// the metalsrc so the mask buffers bind by name (same as ensureSubjectFragment).
    private func ensureMaskedFragment(
        renderer: MetalRenderer
    ) -> (fragment: MTLFunction, indices: [String: Int])? {
        if let fragment = maskedFragment { return (fragment, maskedUniformIndices) }
        if maskedFailed { return nil }
        do {
            let library = try ShaderLibrary(
                device: renderer.device, bundle: Bundle(for: CompositeProcessor.self), fileName: "composite-masked"
            )
            let fragment = try library.function()
            maskedFragment = fragment
            maskedUniformIndices = library.uniformBufferIndices()
            return (fragment, maskedUniformIndices)
        } catch {
            maskedFailed = true
            os_log("composite-masked fragment build failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, error.localizedDescription)
            return nil
        }
    }

    private func ensureBlurFragment(renderer: MetalRenderer) -> MTLFunction? {
        if let fragment = blurFragment { return fragment }
        if blurFailed { return nil }
        if let fragment = loadFixedFragment(fileName: "composite-blur", renderer: renderer) {
            blurFragment = fragment
            return fragment
        }
        blurFailed = true
        return nil
    }

    /// The blur pass runs into a scratch with blend OFF (a .dontCare pass via
    /// drawFullscreen), so it needs a plain non-blended pipeline (makeGenerative-
    /// Pipeline), not one of the CompositeBlend variants the output draws use. Built once.
    private func ensureBlurPipeline(
        fragment: MTLFunction, renderer: MetalRenderer
    ) -> MTLRenderPipelineState? {
        if let pipeline = blurPipeline { return pipeline }
        do {
            let pipeline = try renderer.makeGenerativePipeline(fragment: fragment, label: "composite-blur")
            blurPipeline = pipeline
            return pipeline
        } catch {
            blurFailed = true
            os_log("composite-blur pipeline build failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, error.localizedDescription)
            return nil
        }
    }

    /// Compile a hand-authored fixed-binding fragment (`<fileName>.metalsrc`) into its
    /// own MTLLibrary and return its `main0`. Logs and returns nil on failure; the
    /// caller remembers the failure so it doesn't recompile per frame.
    private func loadFixedFragment(fileName: String, renderer: MetalRenderer) -> MTLFunction? {
        do {
            let library = try ShaderLibrary(
                device: renderer.device, bundle: Bundle(for: CompositeProcessor.self), fileName: fileName
            )
            return try library.function()
        } catch {
            os_log("%{public}@ fragment build failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, fileName, error.localizedDescription)
            return nil
        }
    }

    /// Build-or-return a generative layer fragment + its uniform-index map. Compiles
    /// `<name>.metalsrc` into its own MTLLibrary and parses the buffer-index
    /// decorations, exactly like ShaderProcessor.ensureGenerative. Caches success
    /// and failure so an unknown/broken layer shader degrades to a skipped layer
    /// without recompiling per frame.
    private func ensureGenerative(
        name: String, renderer: MetalRenderer
    ) -> (fragment: MTLFunction, indices: [String: Int])? {
        if let fragment = generativeFragments[name] {
            return (fragment, generativeUniformIndices[name] ?? [:])
        }
        if generativeFailed.contains(name) { return nil }
        do {
            let library = try ShaderLibrary(
                device: renderer.device, bundle: Bundle(for: CompositeProcessor.self), fileName: name
            )
            let fragment = try library.function()
            let indices = library.uniformBufferIndices()
            generativeFragments[name] = fragment
            generativeUniformIndices[name] = indices
            os_log("composite generative layer %{public}@ compiled; uniform indices: %{public}@",
                   log: CompositeProcessor.log, type: .info, name, String(describing: indices))
            return (fragment, indices)
        } catch {
            generativeFailed.insert(name)
            os_log("composite generative layer %{public}@ build failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, name, error.localizedDescription)
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

    /// Bind each JS-set layer uniform by name -> buffer index. float3 is PADDED to
    /// 16 bytes (a Metal `constant float3&` argument occupies 16 bytes); see the
    /// detailed rationale on ShaderProcessor.makeUniformBindings.
    private func makeUniformBindings(
        indices: [String: Int], layer: CompositeLayer
    ) -> [(index: Int, value: [Float])] {
        var bindings = [(index: Int, value: [Float])]()
        for (name, values) in layer.uniforms {
            if CompositeProcessor.builtinNames.contains(name) { continue }
            guard let index = indices[name] else { continue }
            switch values.count {
            case 1, 2, 4:
                bindings.append((index: index, value: values))
            case 3:
                bindings.append((index: index, value: [values[0], values[1], values[2], 0]))
            default:
                os_log("composite layer %{public}@ uniform %{public}@ has unsupported length %d; skipping",
                       log: CompositeProcessor.log, type: .info, layer.shader, name, values.count)
            }
        }
        return bindings
    }

    // MARK: - Image loading

    /// Resolve a composite image `<id>.webp`. The iOS prebuild copies composite images into
    /// the app target's resources under images/<id>.webp (see app.plugin.js's
    /// copyIosImages), so it lands in Bundle.main; fall back to the
    /// Kaleidoscope resource bundle's images/ for a test/static layout.
    /// Mirrors BackgroundImageProcessor.bundledURL but in the images subdir.
    static func imageURL(for id: String) -> URL? {
        let containing = Bundle(for: CompositeProcessor.self)
        let resourceBundle = Bundle.kaleidoscopeResources(relativeTo: containing) ?? containing
        return Bundle.main.url(forResource: id, withExtension: "webp", subdirectory: imagesSubdir)
            ?? Bundle.main.url(forResource: id, withExtension: "webp")
            ?? resourceBundle.url(forResource: id, withExtension: "webp", subdirectory: imagesSubdir)
            ?? resourceBundle.url(forResource: id, withExtension: "webp")
    }

    /// Lazy-load the image WebP as a Metal texture via MTKTextureLoader (decoded by
    /// ImageIO, which supports WebP on iOS 14+; the podspec floors iOS 15). Cached
    /// per id; a failed load is remembered. The texture loads top-left origin like
    /// BackgroundImageProcessor's background; the V-flip parity is folded into the
    /// cover-scale at draw time (see coverScale).
    private func ensureImageTexture(id: String, device: MTLDevice) -> ImageTexture? {
        if let image = imageTextures[id] { return image }
        if missingImages.contains(id) { return nil }
        guard let url = CompositeProcessor.imageURL(for: id) else {
            os_log("composite image %{public}@.webp not found in app bundle or Kaleidoscope.bundle",
                   log: CompositeProcessor.log, type: .error, id)
            missingImages.insert(id)
            return nil
        }
        let loader = MTKTextureLoader(device: device)
        let options: [MTKTextureLoader.Option: Any] = [
            .origin: MTKTextureLoader.Origin.topLeft,
            .SRGB: false,
            .textureUsage: NSNumber(value: MTLTextureUsage.shaderRead.rawValue),
            .textureStorageMode: NSNumber(value: MTLStorageMode.private.rawValue)
        ]
        do {
            let texture = try loader.newTexture(URL: url, options: options)
            let aspect = Float(texture.width) / Float(max(texture.height, 1))
            let image = ImageTexture(texture: texture, aspect: aspect)
            imageTextures[id] = image
            os_log("composite image %{public}@ loaded: %dx%d aspect=%.3f",
                   log: CompositeProcessor.log, type: .info, id, texture.width, texture.height, aspect)
            return image
        } catch {
            missingImages.insert(id)
            os_log("composite image %{public}@ load failed: %{public}@",
                   log: CompositeProcessor.log, type: .error, id, error.localizedDescription)
            return nil
        }
    }

    /// Center-crop cover-fit UV scale (mirrors coverScale in composite.ts / CompositeFactory),
    /// with the V axis NEGATED to fold in the MTKTextureLoader V-flip parity. The
    /// composite-image fragment computes uv = (vUv - 0.5) * coverScale + 0.5; a negative
    /// y reflects about the crop window's center, so the image lands semantic-top at
    /// vUv.y=1, matching the CoreImage-rendered camera "original" (which composites
    /// correct on-device). This is the same texture-origin parity fix
    /// BackgroundImageProcessor applies on uBgUvScale.y; here the cover-scale IS the
    /// sampling scale (the fragment centers it about 0.5), so a single -y suffices
    /// and stays centered for both letterbox branches. Camera orientation is handled
    /// at ingest and is independent of this term. RISK: parity is reasoned, not
    /// device-verified on iOS; if a image renders vertically inverted, this -sy is
    /// the single term to flip back to +sy.
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
