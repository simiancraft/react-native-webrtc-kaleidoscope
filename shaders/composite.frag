#version 300 es
precision mediump float;
uniform sampler2D uOriginal;
uniform sampler2D uBackground;
uniform sampler2D uMask;
uniform vec2 uBgUvScale;
uniform vec2 uBgUvOffset;
uniform vec2 uMaskUvScale;
uniform vec2 uMaskUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec2 maskUv = vUv * uMaskUvScale + uMaskUvOffset;
  float raw = texture(uMask, maskUv).r;
  float safeHi = max(uMaskHi, uMaskLo + 0.001);
  float m = smoothstep(uMaskLo, safeHi, raw);
  vec3 orig = texture(uOriginal, vUv).rgb;
  vec2 bgUv = clamp(vUv * uBgUvScale + uBgUvOffset, 0.0, 1.0);
  vec3 bg = texture(uBackground, bgUv).rgb;
  oColor = vec4(mix(bg, orig, m), 1.0);
}
