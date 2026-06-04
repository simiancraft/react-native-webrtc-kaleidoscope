// Composite SUBJECT layer: the masked camera person, output PREMULTIPLIED (rgb
// scaled by the mask alpha) so a "normal" over-blend composites the person onto
// the stack. uMaskUvScale/uMaskUvOffset carry the mask orientation (identity on
// Android where the readback already aligns the mask; (1,-1)/(0,1) on web).
// safeHi guards smoothstep against edge0 == edge1 (undefined) when uMaskHi
// collapses onto uMaskLo.
//
// iOS binding contract (CompositeProcessor): uCamera at texture(0), uMask at
// texture(1); uMaskUvScale buffer(0), uMaskUvOffset buffer(1), uMaskLo buffer(2),
// uMaskHi buffer(3).
#version 300 es
precision highp float;
uniform sampler2D uCamera;
uniform sampler2D uMask;
uniform vec2 uMaskUvScale;
uniform vec2 uMaskUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec3 cam = texture(uCamera, vUv).rgb;
  float raw = texture(uMask, vUv * uMaskUvScale + uMaskUvOffset).r;
  float safeHi = max(uMaskHi, uMaskLo + 0.001);
  float a = clamp(smoothstep(uMaskLo, safeHi, raw), 0.0, 1.0);
  oColor = vec4(cam * a, a);
}
