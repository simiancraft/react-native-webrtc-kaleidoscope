// Web GLSL entry point. The shader source is generated from the canonical
// `shaders/*.frag` / `*.vert` by `bun run build:shaders` into
// `./shaders.generated`; this module re-exports it so web effect code imports
// from one stable path. Do not hand-edit the generated file.
//
// The three shared shaders:
//   - PASSTHROUGH_VERT_SRC: full-screen quad via gl_VertexID (no VAO/VBO);
//     caller does gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4).
//   - BLUR_FRAG_SRC: separable 1D Gaussian, 9-tap precomputed kernel
//     (uWeights[9] / uOffsets[9], no per-pixel exp). The caller computes the
//     kernel from sigma on the CPU and uploads the arrays; see
//     src/web/effects/blur.ts (blurKernel).
//   - COMPOSITE_FRAG_SRC: mix(background, original, mask). Identical body
//     across web, Android, and (post-transpile) iOS.
//
// Texture-orientation convention (lives in the host uniforms, NOT the shader,
// so the composite body stays identical across runtimes):
//   - uOriginal / uBackground land with semantic "top of source" at GL v=1.
//     Web uploads with UNPACK_FLIP_Y_WEBGL=true (bg staged through an
//     OffscreenCanvas first, since flipY does not apply to ImageBitmap).
//   - uMask is sampled at vUv * uMaskUvScale + uMaskUvOffset. Web direct-uploads
//     the mask with flipY=false and V-flips in the sampling uniforms
//     ((1,-1)/(0,1)); canvas-staging would mangle MediaPipe's soft confidence
//     values via premultiplied alpha and break the hardness slider. Android's
//     readback round-trip leaves the mask aligned, so its uniforms are identity.
//   - uBgUvScale / uBgUvOffset cover-fit center-crop the background when its
//     aspect ratio differs from the output; (1,1)/(0,0) for a full-size bg.
//   - uMaskLo / uMaskHi parameterize the smoothstep, derived from a hardness
//     factor via maskSmoothstepRange in src/web/tuning.ts (mirrors Android's
//     MaskTuning.smoothstepRange).
export { BLUR_FRAG_SRC, COMPOSITE_FRAG_SRC, PASSTHROUGH_VERT_SRC } from './shaders.generated';
