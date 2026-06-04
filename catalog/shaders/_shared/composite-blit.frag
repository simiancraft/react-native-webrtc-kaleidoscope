// Composite BLIT (iOS-only source): draw a finished scratch texture (already
// PREMULTIPLIED) into the output, applying a content-UV transform that folds in
// the scratch's per-pass V parity. Unlike composite-image this does NOT
// re-premultiply: a blur scratch preserves the opaque camera's alpha=1, and an
// image scratch already came through composite-image, so re-premultiplying would
// darken edges. uContentUvScale/uContentUvOffset carry the parity term the host
// supplies, so one shader serves any scratch source.
//
// iOS-only: web and Android reuse the cover-fit composite-image shader for their
// blit (cover scale 1,1); iOS needs this distinct no-premultiply/parity variant,
// the same per-platform divergence as the composite V-flip terms. Not in the
// Android/web codegen; transpiled to composite-blit.metalsrc for iOS.
//
// iOS binding contract (CompositeProcessor): uContentUvScale at buffer(0),
// uContentUvOffset at buffer(1); uTex at texture(0), its sampler at sampler(0).
#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uContentUvScale;
uniform vec2 uContentUvOffset;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec2 uv = vUv * uContentUvScale + uContentUvOffset;
  oColor = texture(uTex, uv);
}
