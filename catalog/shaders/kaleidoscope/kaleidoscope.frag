// Kaleidoscope: the library's namesake. A mirrored polar fold (angle modulo
// 2pi/N) over a cheap drifting sine field; the fold makes any source field
// read as ornamental cut glass. An opaque BACKGROUND layer (issue #61).
//
// Overdrive surface: uSegments changes the whole character (6 = bold facets,
// 12 = lace), the three palette colors re-skin it completely, uRotate/uSpeed
// set the energy. uCalm eases contrast toward frame center, where the masked
// subject's face sits, so the pattern stays lively at the edges without
// flickering behind a speaker.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) at bottom-left,
// (1, 1) at top-right. fragCoord is reconstructed as vUv * uResolution so this
// stays on the vUv convention and never reads gl_FragCoord (whose Y
// orientation flips between OpenGL and Metal). Fully procedural: no input
// texture, so there is no texture-origin handoff to flip. Net texture flips:
// zero on every runtime. The polar fold is rotation-symmetric, so even a
// hypothetical flip would be invisible here; the convention is kept anyway.
//
// Precision: highp float, matching the other procedural shaders (bounded
// sine sums, but vUv is highp by the passthrough.vert contract and the fold's
// atan/mod chain benefits from full mantissa at high segment counts).
//
// Cost class: plasma plus one atan and a mod; no loops, no noise, no hashing.

#version 300 es
precision highp float;

uniform float uTime;       // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;  // framebuffer size in pixels; both components > 0
uniform vec3 uColorA;      // base palette color (also the calm midpoint pole)
uniform vec3 uColorB;      // second palette color
uniform vec3 uColorC;      // accent color, layered over the A/B field
uniform float uSegments;   // mirror segment count; floor()ed, clamped >= 3
uniform float uSpeed;      // source-field drift rate; 0 freezes the pattern
uniform float uRotate;     // whole-field rotation rate; sign sets direction
uniform float uZoom;       // pattern scale; higher = more rings of detail
uniform float uCalm;       // 0..1 eases contrast at frame center (face zone)

in highp vec2 vUv;
out vec4 oColor;

const float TAU = 6.28318530718;

void main() {
  // Aspect-correct, screen-centered coordinates (matches plasma/nebula).
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
  float centerDist = length(uv);

  // Whole-field rotation: the slow "turning the scope" motion.
  float ra = uTime * uRotate;
  float cs = cos(ra);
  float sn = sin(ra);
  uv = mat2(cs, -sn, sn, cs) * uv;

  // Mirrored polar fold. The 1e-5 nudge keeps atan() off the undefined (0,0)
  // input under Metal; it is far below one pixel at any resolution.
  float r = centerDist * uZoom * (1.0 + 0.06 * sin(uTime * 0.23));
  float seg = TAU / max(3.0, floor(uSegments));
  float a = atan(uv.y, uv.x + 1e-5);
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  vec2 p = r * vec2(cos(a), sin(a));

  float t = uTime * uSpeed;

  // Drifting source field, plasma-class: a few sines of folded position and
  // time. The off-axis moving center in the length() term keeps the pattern
  // evolving (non-repeating) rather than pulsing in place.
  float f1 = sin(p.x * 6.0 + t)
      + sin((p.x + p.y) * 4.2 - t * 0.7)
      + sin(length(p - vec2(0.9 + 0.25 * sin(t * 0.31), 0.0)) * 7.0 + t * 1.1);
  float f2 = sin(p.y * 5.0 - t * 0.9 + sin(p.x * 3.1 + t * 0.4));
  float m1 = 0.5 + 0.5 * sin(f1);
  float m2 = smoothstep(0.25, 0.9, 0.5 + 0.5 * sin(f2 + f1 * 0.5));

  vec3 color = mix(uColorA, uColorB, m1);
  color = mix(color, uColorC, m2 * 0.65);

  // Thin darkening along both mirror lines sells the cut-glass facets.
  float seam = smoothstep(0.035, 0.0, abs(a - seg * 0.5)) + smoothstep(0.035, 0.0, a);
  color *= 1.0 - 0.18 * seam;

  // uCalm: ease toward the palette midpoint near frame center. Spatial-only
  // (never scales time per pixel, which would shear the field across the
  // falloff ring).
  vec3 mid = 0.5 * (uColorA + uColorB);
  float calm = uCalm * (1.0 - smoothstep(0.15, 0.62, centerDist));
  color = mix(color, mid, calm * 0.6);

  // Opaque procedural background; the person is composited over it downstream.
  oColor = vec4(color, 1.0);
}
