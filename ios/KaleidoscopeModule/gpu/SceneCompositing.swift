// Layered-compositing additions to MetalRenderer for the scene compositor.
//
// The single-effect path (blur, background-image, plasma) renders ONE pass into
// a BGRA target with blending OFF and a `.dontCare` load (every texel is
// overwritten). A scene is different: an ordered painter's stack composited into
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
// (fragment label, blend mode) so a scene that reuses a shader does not rebuild.
//
// The render target is the output CVPixelBuffer's BGRA Metal texture directly
// (same as encodeComposite writes its result into the output texture); CV-backed
// BGRA IOSurface textures are render-capable, so no extra accumulator texture is
// needed. All passes share the renderer's linear-clamp sampler.

import Foundation
import Metal
import simd

extension MetalRenderer {
  /// How a scene layer's pass blends into the output texture. The base layer is
  /// opaque (blend off); later layers use premultiplied over or add. Mirrors
  /// SceneFactory.applyBlend (Android) / the blendFunc switch in scene.ts (web).
  enum SceneBlend {
    case opaqueBase // layer 0: blending OFF, `.clear` load establishes the base
    case over       // premultiplied "over": ONE, ONE_MINUS_SRC_ALPHA
    case additive   // premultiplied add:    ONE, ONE
  }

  /// Build a render-pipeline state for a scene-layer fragment at a given blend
  /// mode. The fragment writes PREMULTIPLIED RGBA; the blend factors below match
  /// the GL blendFunc the other two platforms set. Reuses the shared passthrough
  /// vertex (fullscreen quad from gl_VertexID). The caller caches the result.
  func makeSceneLayerPipeline(
    fragment: MTLFunction,
    blend: SceneBlend,
    label: String
  ) throws -> MTLRenderPipelineState {
    let desc = MTLRenderPipelineDescriptor()
    desc.label = label
    desc.vertexFunction = passthroughVertex
    desc.fragmentFunction = fragment
    // The Metal Swift API's colorAttachments subscript returns a non-optional
    // descriptor (auto-vivified), matching MetalRenderer.makePipeline's usage.
    let attachment = desc.colorAttachments[0]
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

  /// Begin a scene render pass into `target`, clearing it to opaque black. The
  /// returned encoder is left OPEN: the caller draws every layer into it (each
  /// layer is a fullscreen quad with its own pipeline state and fragment
  /// bindings) and MUST call endEncoding(). A single pass for the whole stack is
  /// correct because Metal applies the pipeline's fixed-function blend against
  /// the attachment's running contents within one encoder, exactly like the GL
  /// FBO accumulation Android does. `.clear` to (0,0,0,1) matches SceneFactory's
  /// opaque-black clear so a non-covering base reads as defined black.
  func beginSceneEncoder(
    commandBuffer: MTLCommandBuffer,
    target: MTLTexture,
    label: String
  ) throws -> MTLRenderCommandEncoder {
    let passDesc = MTLRenderPassDescriptor()
    passDesc.colorAttachments[0].texture = target
    passDesc.colorAttachments[0].loadAction = .clear
    passDesc.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
    passDesc.colorAttachments[0].storeAction = .store
    guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: passDesc) else {
      throw RendererError.commandBufferUnavailable
    }
    encoder.label = label
    return encoder
  }

  /// Draw one image (plate) layer into the open scene encoder. Binds uCoverScale
  /// at buffer(0), the plate texture at texture(0), the shared sampler at
  /// sampler(0) — matching scene-image.metalsrc. Sets the pipeline (which carries
  /// the blend mode) and draws the fullscreen quad.
  func drawSceneImageLayer(
    encoder: MTLRenderCommandEncoder,
    pipeline: MTLRenderPipelineState,
    plate: MTLTexture,
    coverScale: SIMD2<Float>
  ) {
    encoder.setRenderPipelineState(pipeline)
    var coverScaleVar = coverScale
    encoder.setFragmentBytes(&coverScaleVar, length: MemoryLayout<SIMD2<Float>>.stride, index: 0)
    encoder.setFragmentTexture(plate, index: 0)
    encoder.setFragmentSamplerState(linearClampSampler, index: 0)
    encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
  }

  /// Draw the masked-subject layer into the open scene encoder. Binds, matching
  /// scene-subject.metalsrc: buffer(0) uMaskUvScale, (1) uMaskUvOffset, (2)
  /// uMaskLo, (3) uMaskHi; texture(0) uCamera, (1) uMask; sampler(0)/(1).
  func drawSceneSubjectLayer(
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

  /// Draw one generative layer into the open scene encoder. The bindings are the
  /// host built-ins (uTime, uResolution) plus the layer's JS-set uniforms, each
  /// at the buffer index the shader's MSL decoration assigned it (resolved by the
  /// caller via ShaderLibrary.uniformBufferIndices). Name-agnostic, exactly like
  /// MetalRenderer.encodeGenerative; the only difference is it draws into the
  /// shared scene encoder (one pass, blended) rather than its own `.dontCare`
  /// pass.
  func drawSceneGenerativeLayer(
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
}
