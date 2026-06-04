// Web GLSL entry point. The shader source is generated from the canonical
// `shaders/*.frag` / `*.vert` by `bun run build:shaders` into
// `./shaders.generated`; this module re-exports it so web effect code imports
// from one stable path. Do not hand-edit the generated file.
//
// The compositor folds every effect into one layered stage (see
// web-driver/effects/composite.ts). The shared sources the runtime imports from here:
//   - PASSTHROUGH_VERT_SRC: full-screen quad via gl_VertexID (no VAO/VBO);
//     caller does gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4).
//   - COMPOSITE_CAMERA_FRAG_SRC: the camera/direct layer (canonical
//     shaders/_shared/composite-camera.frag).
//   - COMPOSITE_BLUR_FRAG_SRC: the camera-sampling blur layer (canonical
//     shaders/blur/composite-blur.frag).
// The compositor still carries its blit, image, subject, and masked-composite
// programs inline (intentionally hand-authored; small, stable, bespoke bindings).
export {
  COMPOSITE_BLUR_FRAG_SRC,
  COMPOSITE_CAMERA_FRAG_SRC,
  PASSTHROUGH_VERT_SRC,
} from './shaders.generated';
