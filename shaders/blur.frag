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
