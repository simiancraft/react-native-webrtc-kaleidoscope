// Composite: mix(background, original, mask). Same shader serves blur,
// background-image, and future procedural backgrounds; the per-effect
// difference lives upstream in how uBackground is produced.
//
// UV convention: vUv = (0, 0) at bottom-left, (1, 1) at top-right.
// uOriginal and uBackground are expected to land with semantic "top of
// source image" at GL v=1; per-platform upload code enforces that.
//
// PER-PLATFORM V-FLIP PARITY (verified; do NOT unify or "clean up" to identity).
// The vertical flip a composite path needs comes from each platform's
// texture-origin convention plus render-pass parity (the odd ping-pong pass
// count) — NOT from camera orientation, which is normalized once at the ingest.
// It lands on a DIFFERENT uniform per platform:
//   - Web (blur AND background): uMaskUvScale=(1,-1), uMaskUvOffset=(0,1);
//     uBgUvScale/Offset carry cover-fit only.
//   - iOS blur: uBgUvScale=(1,-1), uBgUvOffset=(0,1) (odd ping-pong passes);
//     uMaskUvScale/Offset identity.
//   - iOS background: all identity except uBgUvScale/Offset cover-fit
//     (single composite pass, no parity flip).
//   - Android (blur AND background): all identity except uBgUvScale cover-fit.
// Zeroing web's uMaskUvScale, or copying iOS's bgUvScale=(1,-1) onto Android,
// breaks that platform. See PATTERNS.md "Texture-orientation convention."

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
