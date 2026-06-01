// Web GLSL entry point. The shader source is generated from the canonical
// `shaders/*.frag` / `*.vert` by `bun run build:shaders` into
// `./shaders.generated`; this module re-exports it so web effect code imports
// from one stable path. Do not hand-edit the generated file.
//
// The compositor folds every effect into one layered stage (see
// src/web/effects/scene.ts), so the only shared source the runtime still imports
// from here is the full-screen-quad vertex shader:
//   - PASSTHROUGH_VERT_SRC: full-screen quad via gl_VertexID (no VAO/VBO);
//     caller does gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4).
// The former single-effect fragment sources (BLUR_FRAG_SRC, COMPOSITE_FRAG_SRC,
// SHADER_SOURCES) are no longer consumed: the compositor carries its own blur,
// camera, masked-composite, and per-layer generative programs inline.
export { PASSTHROUGH_VERT_SRC } from './shaders.generated';
