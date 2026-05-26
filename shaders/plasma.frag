// Plasma: a two-color time-morphing procedural background.
//
// The specimen for the generic procedural-shader processor (issue #25/#26).
// Deliberately the cheapest engine still worth shipping: a small sum of sines
// of position and time, mapped between two palette colors. No loops, no noise,
// no hashing, so it stays comfortably within the per-frame budget the shader-
// authoring guide sets. One plasma.frag fans out into many named presets
// (ocean, sunset, mint, slow, fast) by varying its uniforms.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) at bottom-left,
// (1, 1) at top-right. fragCoord is reconstructed as vUv * uResolution so this
// stays on the vUv convention and never reads gl_FragCoord (whose Y
// orientation flips between OpenGL and Metal). Fully procedural: no input
// texture, so there is no texture-origin handoff to flip. Net texture flips:
// zero on every runtime.
//
// Precision: highp float. The plasma value is a bounded sum of sines (range
// well within mediump), but vUv is highp by the passthrough.vert contract and
// the aspect-correct division below keeps the field stable at high resolution;
// highp matches the other procedural shaders and avoids banding on mobile.

#version 300 es
precision highp float;

uniform float uTime;       // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;  // framebuffer size in pixels; both components > 0
uniform vec3 uColorA;      // first palette color, linear-ish RGB in [0, 1]
uniform vec3 uColorB;      // second palette color, linear-ish RGB in [0, 1]
uniform float uSpeed;      // animation rate multiplier; 0 freezes the field
uniform float uScale;      // spatial frequency; higher = more, tighter cells

in highp vec2 vUv;
out vec4 oColor;

void main() {
  // Aspect-correct, screen-centered coordinates (matches nebula.frag): divide
  // by the height so uScale reads the same regardless of aspect ratio.
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;

  float t = uTime * uSpeed;

  // Classic demoscene plasma: a few sines of position and time. The radial
  // term (length(uv)) gives the field an organic, non-grid-aligned drift.
  float v = sin(uv.x * uScale + t);
  v += sin(uv.y * uScale + t * 0.8);
  v += sin((uv.x + uv.y) * uScale * 0.7 + t * 1.3);
  v += sin(length(uv) * uScale * 1.2 - t);

  // v ranges roughly [-4, 4]; fold through sin to a smooth [0, 1] mix factor.
  float mixT = 0.5 + 0.5 * sin(v);

  // Opaque procedural background; the person is composited over it downstream.
  oColor = vec4(mix(uColorA, uColorB, mixT), 1.0);
}
