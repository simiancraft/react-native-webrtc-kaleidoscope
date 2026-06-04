// Composite MASKED layer: stencil a rendered scratch (uTex, treated as
// premultiplied) to the subject by multiplying through the mask alpha, keeping the
// result premultiplied so the caller's "over"/"additive" blend composites it
// correctly. Lets a generative/blur/image layer target the subject instead of the
// background. Mask UV and safeHi as in composite-subject.
//
// iOS binding contract (CompositeProcessor): uTex at texture(0), uMask at
// texture(1); uMaskUvScale buffer(0), uMaskUvOffset buffer(1), uMaskLo buffer(2),
// uMaskHi buffer(3).
#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform vec2 uMaskUvScale;
uniform vec2 uMaskUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec4 c = texture(uTex, vUv);
  float raw = texture(uMask, vUv * uMaskUvScale + uMaskUvOffset).r;
  float safeHi = max(uMaskHi, uMaskLo + 0.001);
  float a = clamp(smoothstep(uMaskLo, safeHi, raw), 0.0, 1.0);
  oColor = c * a;
}
