// Separable 1D Gaussian blur, 9-tap with pre-computed weight + offset
// uniform arrays. Caller invokes twice per frame, horizontal then vertical,
// with uAxis = (1/width, 0) and (0, 1/height) respectively.
//
// UV convention: matches passthrough.vert; vUv samples uTex with semantic
// top of source image at v=1. Mediump precision on color math; highp on
// vUv for cancellation safety near the v=1 edge. spirv-cross drops
// RelaxedPrecision in MSL by default, so the transpiled blur.metal will
// promote everything to float — verify on first transpile.

#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uAxis;
uniform float uWeights[9];
uniform float uOffsets[9];
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec4 color = texture(uTex, vUv) * uWeights[0];
  for (int i = 1; i < 9; i++) {
    vec2 off = uAxis * uOffsets[i];
    color += texture(uTex, vUv + off) * uWeights[i];
    color += texture(uTex, vUv - off) * uWeights[i];
  }
  oColor = color;
}
