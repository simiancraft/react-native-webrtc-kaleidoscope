// Neo-Memphis: scattered flat-color geometric primitives (discs, rings,
// triangles, crosses, boxes, squiggles) drifting on a quiet field; the 90s
// Memphis-design / "Jazz cup" pattern family as an opaque BACKGROUND layer
// (issue #61). Two parallax cell layers: hero shapes plus a smaller, dimmer
// backfill texture.
//
// Overdrive surface: the four palette colors re-skin it completely (pastel
// studio / bold primary / duotone), uDensity and uScale set busy-ness,
// uOutline trades filled shapes for outlined ones, uDrift sets the energy.
// uCalm fades shapes out near frame center, where the masked subject's face
// sits.
//
// Cost: per pixel, two cell layers each evaluate ONE hash and at most one
// shape SDF in the HOME cell only; shape extent (size + bob) stays below the
// half-cell bound, so there is no 3x3 neighbor sweep (contrast nebula's
// Star). No noise, no pow; one sin per squiggle cell.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) at bottom-left,
// (1, 1) at top-right. fragCoord is reconstructed as vUv * uResolution; no
// gl_FragCoord. Fully procedural: no input texture, zero net texture flips on
// every runtime.
//
// Precision: highp float. The hash uses large multipliers (fract-of-product
// tricks); mediump collapses them to banding, same reasoning as nebula.

#version 300 es
precision highp float;

uniform float uTime;       // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;  // framebuffer size in pixels; both components > 0
uniform vec3 uBgColor;     // field color behind the shapes
uniform vec3 uColorA;      // shape palette color 1
uniform vec3 uColorB;      // shape palette color 2
uniform vec3 uColorC;      // shape palette color 3
uniform float uScale;      // hero-grid cells across frame height
uniform float uDensity;    // probability a cell draws its shape, 0..1
uniform float uOutline;    // probability a shape renders outlined, 0..1
uniform float uDrift;      // scroll + rotation rate; 0 freezes
uniform float uCalm;       // 0..1 fades shapes near frame center (face zone)

in highp vec2 vUv;
out vec4 oColor;

const float TAU = 6.28318530718;
// Antialias half-width in cell units; ~1px at the default pitch.
const float AA = 0.012;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

// iq's equilateral triangle, point up, circumradius r.
float sdTriangle(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) {
    p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
  }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

// One cell layer: returns the shape coverage and writes its color.
// luv is the layer's scrolled cell-space coordinate; backfill restricts the
// shape menu to dots and crosses and draws smaller.
float memphisCell(vec2 luv, float seed, float backfill, float t, out vec3 shapeColor) {
  vec2 id = floor(luv);
  vec2 gv = fract(luv) - 0.5;
  float h = hash21(id + seed);
  shapeColor = uBgColor;
  // Density gate: empty cells cost one hash.
  if (h > uDensity) return 0.0;

  float h2 = fract(h * 57.31);
  float h3 = fract(h * 113.77);
  float h4 = fract(h * 431.13);
  float h5 = fract(h * 891.71);

  // Per-cell slow spin and a small bob; both bounded so the shape stays
  // inside its cell (max extent 0.34 + 0.04 < 0.5).
  float ang = h2 * TAU + t * (h3 - 0.5) * 0.8;
  float cs = cos(ang);
  float sn = sin(ang);
  gv -= 0.04 * vec2(sin(t * 0.6 + h * TAU), cos(t * 0.8 + h * TAU));
  gv = mat2(cs, -sn, sn, cs) * gv;

  float r = mix(0.14, 0.30, h3) * mix(1.0, 0.6, backfill);
  float pick = h4 * 6.0;
  float d;
  if (backfill > 0.5) {
    // Backfill texture: dots and crosses only.
    d = (pick < 3.0)
        ? length(gv) - r * 0.45
        : min(sdBox(gv, vec2(r, r * 0.22)), sdBox(gv, vec2(r * 0.22, r)));
  } else if (pick < 1.0) {
    d = length(gv) - r;                                   // disc
  } else if (pick < 2.0) {
    d = abs(length(gv) - r * 0.8) - r * 0.18;             // ring
  } else if (pick < 3.0) {
    d = sdTriangle(gv, r);                                // triangle
  } else if (pick < 4.0) {
    d = min(sdBox(gv, vec2(r, r * 0.24)), sdBox(gv, vec2(r * 0.24, r))); // cross
  } else if (pick < 5.0) {
    d = sdBox(gv, vec2(r * 0.78, r * 0.78));              // box
  } else {
    // Squiggle: a sine-displaced band, clipped to its run length.
    d = max(abs(gv.y - 0.4 * r * sin(gv.x / r * 6.5)) - r * 0.17, abs(gv.x) - r);
  }

  float fill = smoothstep(AA, -AA, d);
  float ring = smoothstep(AA, -AA, abs(d + r * 0.06) - r * 0.09);
  float m = (h5 < uOutline) ? ring : fill;

  float colorPick = fract(h * 769.23) * 3.0;
  shapeColor = (colorPick < 1.0) ? uColorA : (colorPick < 2.0) ? uColorB : uColorC;
  return m;
}

void main() {
  // Aspect-correct, screen-centered coordinates (matches plasma/nebula).
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
  float centerDist = length(uv);

  float t = uTime * uDrift;
  vec3 color = uBgColor;
  vec3 shapeColor;

  // Backfill layer first (under the hero shapes): smaller, denser, dimmer.
  vec2 luv1 = uv * uScale * 2.3 + vec2(t * 0.045, t * -0.03) + 51.7;
  float m1 = memphisCell(luv1, 7.0, 1.0, t, shapeColor);
  color = mix(color, mix(uBgColor, shapeColor, 0.55), m1);

  // Hero layer: the big shapes, scrolling the other way.
  vec2 luv0 = uv * uScale + vec2(t * -0.06, t * 0.04);
  float m0 = memphisCell(luv0, 0.0, 0.0, t, shapeColor);

  // uCalm: fade shapes (not the field) near frame center.
  float calm = 1.0 - uCalm * (1.0 - smoothstep(0.15, 0.62, centerDist));
  color = mix(color, shapeColor, m0 * calm);

  // Opaque procedural background; the person is composited over it downstream.
  oColor = vec4(color, 1.0);
}
