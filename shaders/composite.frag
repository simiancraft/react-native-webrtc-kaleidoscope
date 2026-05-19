// Composite: mix(background, original, mask). Same shader serves blur,
// background-image, and future procedural backgrounds; the per-effect
// difference lives upstream in how uBackground is produced.
//
// UV convention: vUv = (0, 0) at bottom-left, (1, 1) at top-right.
// uOriginal and uBackground are expected to land with semantic "top of
// source image" at GL v=1; per-platform upload code enforces that.
//
// uMaskUvScale / uMaskUvOffset: per-runtime mask orientation transform.
// The Swift host on iOS must NOT blindly copy the (1, -1) / (0, 1) values
// used on web; Metal's texture sampling origin differs from OpenGL's, so
// the V-flip needed there may not be needed (or may be applied
// differently) on iOS. The right values to pass are determined by where
// the mask actually lands relative to vUv after upload; verify
// empirically on first run, then write the iOS values down here.

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
