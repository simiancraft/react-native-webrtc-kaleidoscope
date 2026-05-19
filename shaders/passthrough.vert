// Procedural full-screen quad. Caller draws four vertices via TRIANGLE_STRIP
// with no VAO/VBO; gl_VertexID drives position.
//
// UV convention: vUv = (0, 0) at the BOTTOM-LEFT of the quad, (1, 1) at the
// TOP-RIGHT. Fragment shaders sample textures with this same orientation,
// expecting each input texture to land with its semantic top of source
// image at v=1 (head at top, sky at top). Per-platform host code enforces
// that convention at the upload boundary; see PATTERNS.md "Texture
// orientation convention."
//
// MSL behavior: spirv-cross emits a Y-inversion in the MSL vertex output
// (gl_Position.y negated) so that this convention round-trips correctly
// to Metal's default top-left framebuffer origin. Verify by reading the
// generated passthrough.metal once the transpiler runs.

#version 300 es
precision highp float;
out highp vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 1), float(gl_VertexID & 2));
  vUv = p * 0.5;
  gl_Position = vec4(p - 1.0, 0.0, 1.0);
}
