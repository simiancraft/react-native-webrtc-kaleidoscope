// Composite compositor BLUR layer: a camera-sampling separable gaussian, 13-tap
// (base offsets -6..6, scaled by a sigma-coupled spread), sigma-weighted. One pass
// per direction (uDir is the texel step on the active axis): horizontal camera ->
// scratchA, then vertical scratchA -> scratchB. Output keeps the source alpha (the
// camera is opaque).
//
// The tap spacing scales with sigma (spread): the high end of the slider gains a
// little extra reach plus a faint ghost/double-image instead of flatlining once the
// kernel saturates (~sigma 7). Intentional coupling; one knob drives both blur
// softness and tap spacing, so this is a small multi-fx unit, not a pure gaussian.
// Keep the spread term. No floor, so at low sigma the spread is sub-texel (taps
// overlap, near no-op).
//
// Canonical single source for all three runtimes (build:shaders): web
// COMPOSITE_BLUR_FRAG_SRC, Android Shaders.COMPOSITE_BLUR_FRAG, iOS
// composite-blur.metalsrc. The host supplies uDir + uSigma; on iOS CompositeRendering
// binds them by name (ShaderLibrary.uniformBufferIndices), so the spirv-cross buffer
// order is not assumed. Do not hand-edit the generated copies.
#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uSigma;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  float s2 = 2.0 * uSigma * uSigma;
  float w[7];
  float sum = 0.0;
  for (int i = 0; i < 7; i++) {
    w[i] = exp(-(float(i) * float(i)) / s2);
    sum += (i == 0) ? w[i] : 2.0 * w[i];
  }
  float spread = uSigma * 0.25;
  vec4 acc = texture(uTex, vUv) * (w[0] / sum);
  for (int i = 1; i < 7; i++) {
    vec2 off = uDir * float(i) * spread;
    acc += texture(uTex, vUv + off) * (w[i] / sum);
    acc += texture(uTex, vUv - off) * (w[i] / sum);
  }
  oColor = acc;
}
