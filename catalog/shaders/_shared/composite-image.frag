// Composite IMAGE layer: cover-fit a still texture and output PREMULTIPLIED, so a
// straight-alpha image (a transparent sky / cut-out opening) composites correctly
// under the premultiplied "over" blend. uCoverScale zooms the UV about center to
// crop-fit. No V-flip in-shader: the image arrives semantic-top at v=1 by sample
// time, but how it gets upright is per-platform: web flips on GL upload
// (UNPACK_FLIP_Y_WEBGL), Android pre-flips the bitmap (Matrix preScale) on upload,
// and iOS folds the parity into a negated uCoverScale.y at draw time. Web also uses
// this as its blit shader (scratch -> output at cover scale 1,1); iOS has a distinct
// composite-blit.
//
// iOS binding contract (CompositeProcessor): uCoverScale at buffer(0), uTex at
// texture(0), its sampler at sampler(0).
#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uCoverScale;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec2 uv = (vUv - 0.5) * uCoverScale + 0.5;
  vec4 c = texture(uTex, uv);
  oColor = vec4(c.rgb * c.a, c.a);
}
