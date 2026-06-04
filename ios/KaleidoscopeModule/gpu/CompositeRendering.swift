// Layered-compositing additions to MetalRenderer for the composite compositor.
//
// The single-effect path (blur, plasma, the transform ops) renders ONE pass into
// a BGRA target with blending OFF and a `.dontCare` load (every texel is
// overwritten). A composite is different: an ordered painter's stack composited into
// one output texture, layer 0 opaque and later layers blended over it. Android
// does this by toggling GL fixed-function blend state per layer while drawing
// into one FBO; on Metal the blend state is baked into the render-pipeline
// state, so we:
//
//   - draw layer 0 with a NO-BLEND pipeline and a `.clear` load (opaque black,
//     alpha 1), establishing the opaque base, then
//   - draw layers 1..n into the SAME texture with a `.load` load action and a
//     blend-ENABLED pipeline whose factors implement premultiplied "over"
//     (normal) or premultiplied "add" (additive).
//
// Because the blend mode is fixed per pipeline state, each layer fragment
// (image / subject / a generative shader) needs THREE pipeline variants: opaque
// base, premultiplied-over, premultiplied-add. They are cached by
// (fragment label, blend mode) so a composite that reuses a shader does not rebuild.
//
// The render target is the output CVPixelBuffer's BGRA Metal texture directly
// (same as encodeComposite writes its result into the output texture); CV-backed
// BGRA IOSurface textures are render-capable, so no extra accumulator texture is
// needed. All passes share the renderer's linear-clamp sampler.

import Foundation
import Metal
import simd

extension MetalRenderer {
    /// How a composite layer's pass blends into the output texture. The base layer is
    /// opaque (blend off); later layers use premultiplied over or add. Mirrors
    /// CompositeFactory.applyBlend (Android) / the blendFunc switch in composite.ts (web).
    enum CompositeBlend {
        case opaqueBase // layer 0: blending OFF, `.clear` load establishes the base
        case over // premultiplied "over": ONE, ONE_MINUS_SRC_ALPHA
        case additive // premultiplied add:    ONE, ONE
    }

    /// Build a render-pipeline state for a composite-layer fragment at a given blend
    /// mode. The fragment writes PREMULTIPLIED RGBA; the blend factors below match
    /// the GL blendFunc the other two platforms set. Reuses the shared passthrough
    /// vertex (fullscreen quad from gl_VertexID). The caller caches the result.
    func makeCompositeLayerPipeline(
        fragment: MTLFunction,
        blend: CompositeBlend,
        label: String
    ) throws -> MTLRenderPipelineState {
        let desc = MTLRenderPipelineDescriptor()
        desc.label = label
        desc.vertexFunction = passthroughVertex
        desc.fragmentFunction = fragment
        // The pipeline descriptor's colorAttachments subscript returns an
        // implicitly-unwrapped optional; binding it to a `let` collapses that to a
        // plain Optional, so force-unwrap here (index 0 is always present). Note this
        // differs from MTLRenderPassDescriptor.colorAttachments (used in
        // beginCompositeEncoder below), whose subscript is non-optional.
        let attachment = desc.colorAttachments[0]!
        attachment.pixelFormat = .bgra8Unorm
        switch blend {
        case .opaqueBase:
            attachment.isBlendingEnabled = false
        case .over:
            attachment.isBlendingEnabled = true
            // Premultiplied "over": out = src + dst * (1 - src.a). The fragment already
            // premultiplied rgb by alpha, so the source factor is ONE.
            attachment.rgbBlendOperation = .add
            attachment.alphaBlendOperation = .add
            attachment.sourceRGBBlendFactor = .one
            attachment.sourceAlphaBlendFactor = .one
            attachment.destinationRGBBlendFactor = .oneMinusSourceAlpha
            attachment.destinationAlphaBlendFactor = .oneMinusSourceAlpha
        case .additive:
            attachment.isBlendingEnabled = true
            // Premultiplied add: out = src + dst.
            attachment.rgbBlendOperation = .add
            attachment.alphaBlendOperation = .add
            attachment.sourceRGBBlendFactor = .one
            attachment.sourceAlphaBlendFactor = .one
            attachment.destinationRGBBlendFactor = .one
            attachment.destinationAlphaBlendFactor = .one
        }
        do {
            return try device.makeRenderPipelineState(descriptor: desc)
        } catch {
            throw RendererError.pipelineCreateFailed("\(label): \(error.localizedDescription)")
        }
    }

    /// Begin a composite render pass into `target`. The returned encoder is left OPEN:
    /// the caller draws ONE layer's output quad into it and MUST call endEncoding().
    ///
    /// `clear` controls the load action: the BASE layer opens with `.clear`
    /// (opaque black, alpha 1) to establish the opaque base; every later output
    /// draw opens with `.load`, preserving the running composite so the pipeline's
    /// fixed-function blend blends the new quad against the accumulated contents.
    ///
    /// WHY one encoder PER output draw (not one for the whole stack as before): a
    /// scratch-backed layer (blur, or any layer targeting the subject) must render
    /// its content into a SEPARATE .private texture FIRST, which is its own render
    /// pass; two encoders cannot be open on one command buffer at once, and an open
    /// encoder cannot be interleaved with a different-target pass. Re-opening the
    /// composite encoder with `.load` between scratch passes is the Metal-faithful
    /// analogue of the GL "bind output FBO, set blend, draw" the other two
    /// platforms repeat per layer (Android's bindOutputBlend). `.clear` to
    /// (0,0,0,1) matches CompositeFactory's opaque-black base clear so a non-covering
    /// base reads as defined black.
    func beginCompositeEncoder(
        commandBuffer: MTLCommandBuffer,
        target: MTLTexture,
        clear: Bool,
        label: String
    ) throws -> MTLRenderCommandEncoder {
        let passDesc = MTLRenderPassDescriptor()
        passDesc.colorAttachments[0].texture = target
        passDesc.colorAttachments[0].loadAction = clear ? .clear : .load
        passDesc.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        passDesc.colorAttachments[0].storeAction = .store
        guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: passDesc) else {
            throw RendererError.commandBufferUnavailable
        }
        encoder.label = label
        return encoder
    }

    /// Draw one image layer into the open composite encoder. Binds uCoverScale
    /// at buffer(0), the image texture at texture(0), the shared sampler at
    /// sampler(0); matching composite-image.metalsrc. Sets the pipeline (which carries
    /// the blend mode) and draws the fullscreen quad.
    func drawCompositeImageLayer(
        encoder: MTLRenderCommandEncoder,
        pipeline: MTLRenderPipelineState,
        image: MTLTexture,
        coverScale: SIMD2<Float>
    ) {
        encoder.setRenderPipelineState(pipeline)
        var coverScaleVar = coverScale
        encoder.setFragmentBytes(&coverScaleVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
        encoder.setFragmentTexture(image, index: 0)
        encoder.setFragmentSamplerState(linearClampSampler, index: 0)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    }

    /// Draw the masked-subject layer into the open composite encoder. Binds, matching
    /// composite-subject.metalsrc: buffer(0) uMaskUvScale, (1) uMaskUvOffset, (2)
    /// uMaskLo, (3) uMaskHi; texture(0) uCamera, (1) uMask; sampler(0)/(1).
    func drawCompositeSubjectLayer(
        encoder: MTLRenderCommandEncoder,
        pipeline: MTLRenderPipelineState,
        camera: MTLTexture,
        mask: MTLTexture,
        maskUvScale: SIMD2<Float>,
        maskUvOffset: SIMD2<Float>,
        maskLo: Float,
        maskHi: Float
    ) {
        encoder.setRenderPipelineState(pipeline)
        var maskUvScaleVar = maskUvScale
        var maskUvOffsetVar = maskUvOffset
        var maskLoVar = maskLo
        var maskHiVar = maskHi
        encoder.setFragmentBytes(&maskUvScaleVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
        encoder.setFragmentBytes(&maskUvOffsetVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 1)
        encoder.setFragmentBytes(&maskLoVar, length: MemoryLayout<Float>.stride, index: 2)
        encoder.setFragmentBytes(&maskHiVar, length: MemoryLayout<Float>.stride, index: 3)
        encoder.setFragmentTexture(camera, index: 0)
        encoder.setFragmentTexture(mask, index: 1)
        encoder.setFragmentSamplerState(linearClampSampler, index: 0)
        encoder.setFragmentSamplerState(linearClampSampler, index: 1)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    }

    /// Draw one generative layer into the open composite encoder. The bindings are the
    /// host built-ins (uTime, uResolution) plus the layer's JS-set uniforms, each
    /// at the buffer index the shader's MSL decoration assigned it (resolved by the
    /// caller via ShaderLibrary.uniformBufferIndices). Name-agnostic, exactly like
    /// MetalRenderer.encodeGenerative; the only difference is it draws into the
    /// shared composite encoder (one pass, blended) rather than its own `.dontCare`
    /// pass.
    func drawCompositeGenerativeLayer(
        encoder: MTLRenderCommandEncoder,
        pipeline: MTLRenderPipelineState,
        builtinBindings: [(index: Int, value: [Float])],
        uniformBindings: [(index: Int, value: [Float])]
    ) {
        encoder.setRenderPipelineState(pipeline)
        for binding in builtinBindings {
            binding.value.withUnsafeBytes { ptr in
                encoder.setFragmentBytes(ptr.baseAddress!, length: ptr.count, index: binding.index)
            }
        }
        for binding in uniformBindings {
            binding.value.withUnsafeBytes { ptr in
                encoder.setFragmentBytes(ptr.baseAddress!, length: ptr.count, index: binding.index)
            }
        }
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    }

    /// Draw the raw camera fullscreen (direct/background) into the open composite
    /// encoder. Binds the camera texture at texture(0), the shared sampler at
    /// sampler(0); matching composite-camera.metalsrc. No uniform buffers. Mirrors
    /// CompositeFactory.drawCameraLayer (Android) / the direct/background branch in
    /// composite.ts.
    func drawCompositeCameraLayer(
        encoder: MTLRenderCommandEncoder,
        pipeline: MTLRenderPipelineState,
        camera: MTLTexture
    ) {
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentTexture(camera, index: 0)
        encoder.setFragmentSamplerState(linearClampSampler, index: 0)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    }

    /// Blit a finished scratch texture (premultiplied) into the open composite encoder
    /// with a content-UV transform that folds in the scratch's per-pass V parity.
    /// Used for a blur/background layer. Binds uContentUvScale at buffer(0),
    /// uContentUvOffset at buffer(1), the scratch at texture(0), the shared sampler
    /// at sampler(0); matching composite-blit.metalsrc. Mirrors CompositeFactory.drawBlit
    /// (Android) / the blur/background blit in composite.ts.
    func drawCompositeBlitLayer(
        encoder: MTLRenderCommandEncoder,
        pipeline: MTLRenderPipelineState,
        content: MTLTexture,
        contentUvScale: SIMD2<Float>,
        contentUvOffset: SIMD2<Float>
    ) {
        encoder.setRenderPipelineState(pipeline)
        var contentUvScaleVar = contentUvScale
        var contentUvOffsetVar = contentUvOffset
        encoder.setFragmentBytes(&contentUvScaleVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
        encoder.setFragmentBytes(&contentUvOffsetVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 1)
        encoder.setFragmentTexture(content, index: 0)
        encoder.setFragmentSamplerState(linearClampSampler, index: 0)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    }

    /// Stencil a finished scratch texture (premultiplied) to the subject through
    /// the mask alpha, into the open composite encoder. This is how ANY non-direct
    /// layer (generative, image, blur) targets the subject. Binds, matching
    /// composite-masked.metalsrc: buffer(0) uContentUvScale, (1) uContentUvOffset, (2)
    /// uMaskUvScale, (3) uMaskUvOffset, (4) uMaskLo, (5) uMaskHi; texture(0) content,
    /// (1) mask; sampler(0)/(1). Mirrors CompositeFactory.drawMaskedComposite (Android)
    /// / the masked-composite pass in composite.ts.
    func drawCompositeMaskedLayer(
        encoder: MTLRenderCommandEncoder,
        pipeline: MTLRenderPipelineState,
        content: MTLTexture,
        mask: MTLTexture,
        contentUvScale: SIMD2<Float>,
        contentUvOffset: SIMD2<Float>,
        maskUvScale: SIMD2<Float>,
        maskUvOffset: SIMD2<Float>,
        maskLo: Float,
        maskHi: Float
    ) {
        encoder.setRenderPipelineState(pipeline)
        var contentUvScaleVar = contentUvScale
        var contentUvOffsetVar = contentUvOffset
        var maskUvScaleVar = maskUvScale
        var maskUvOffsetVar = maskUvOffset
        var maskLoVar = maskLo
        var maskHiVar = maskHi
        encoder.setFragmentBytes(&contentUvScaleVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
        encoder.setFragmentBytes(&contentUvOffsetVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 1)
        encoder.setFragmentBytes(&maskUvScaleVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 2)
        encoder.setFragmentBytes(&maskUvOffsetVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 3)
        encoder.setFragmentBytes(&maskLoVar, length: MemoryLayout<Float>.stride, index: 4)
        encoder.setFragmentBytes(&maskHiVar, length: MemoryLayout<Float>.stride, index: 5)
        encoder.setFragmentTexture(content, index: 0)
        encoder.setFragmentTexture(mask, index: 1)
        encoder.setFragmentSamplerState(linearClampSampler, index: 0)
        encoder.setFragmentSamplerState(linearClampSampler, index: 1)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    }

    /// Encode one camera-sampling separable-gaussian blur pass (`source` ->
    /// `target`) along `axis`, into its OWN render pass (blend off, `.dontCare`
    /// load: every texel overwritten). The host runs this twice (horizontal then
    /// vertical) into ping-pong scratch textures; see CompositeProcessor.
    /// composite-blur.metalsrc bindings: buffer(0) uDir, buffer(1) uSigma; texture(0)
    /// uTex; sampler(0). Reuses drawFullscreen, so it shares the dontCare-load
    /// single-quad convention with the standalone blur/transform passes.
    func encodeCompositeBlurPass(
        commandBuffer: MTLCommandBuffer,
        pipeline: MTLRenderPipelineState,
        source: MTLTexture,
        target: MTLTexture,
        dir: SIMD2<Float>,
        sigma: Float,
        label: String
    ) throws {
        try drawFullscreen(
            commandBuffer: commandBuffer,
            pipeline: pipeline,
            target: target,
            label: label
        ) { encoder in
            var dirVar = dir
            var sigmaVar = sigma
            // Buffer indices match the transpiled composite-blur.metalsrc, which
            // spirv-cross auto-maps as uSigma -> buffer(0), uDir -> buffer(1).
            encoder.setFragmentBytes(&sigmaVar, length: MemoryLayout<Float>.stride, index: 0)
            encoder.setFragmentBytes(&dirVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 1)
            encoder.setFragmentTexture(source, index: 0)
            encoder.setFragmentSamplerState(linearClampSampler, index: 0)
        }
    }

    /// Two .private composite scratch render targets, BGRA at full output resolution,
    /// allocated on first use or resolution change. scratchA holds a subject
    /// layer's rendered content (and the blur's horizontal pass); scratchB holds
    /// the blur's vertical pass. Mirrors CompositeFactory's scratchA/scratchB Fbos and
    /// composite.ts's createFbo pair. Distinct from blurPingPong (the standalone blur
    /// effect's intermediates) so the two paths never alias.
    func compositeScratch(width: Int, height: Int) throws -> (MTLTexture, MTLTexture) {
        if let a = compositeScratchA, let b = compositeScratchB,
           compositeScratchWidth == width, compositeScratchHeight == height
        {
            return (a, b)
        }
        let a = try makeGenerativeTarget(width: width, height: height)
        let b = try makeGenerativeTarget(width: width, height: height)
        compositeScratchA = a
        compositeScratchB = b
        compositeScratchWidth = width
        compositeScratchHeight = height
        return (a, b)
    }
}
