// Halftone waves: a dot lattice whose dot size is modulated by slow traveling
// interference waves; the late-2000s "mathematical" tech texture as an opaque
// BACKGROUND layer (issue #61). The cheapest of the corporate-abstract set:
// per pixel, one hash-free cell lookup, two sines evaluated at the CELL CENTER
// (so every pixel of a dot agrees), and one blended distance metric. No noise,
// no pow, no loops.
//
// Overdrive surface: the two-tone palette inverts the whole mood (ink on
// paper vs paper on ink), uPitch sets the texture scale, uShape morphs the
// dots diamond -> circle -> square, uWaveAmp and uSpeed set how alive it is.
// uCalm eases the wave modulation near frame center, where the masked
// subject's face sits.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) at bottom-left,
// (1, 1) at top-right. fragCoord is reconstructed as vUv * uResolution; no
// gl_FragCoord. Fully procedural: no input texture, zero net texture flips on
// every runtime.
//
// Precision: highp float, matching the other procedural shaders; the cell
// math is plain fract/floor and would survive mediump, but consistency wins.

#version 300 es
precision highp float;

uniform float uTime;       // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;  // framebuffer size in pixels; both components > 0
uniform vec3 uPaper;       // field color (behind the dots)
uniform vec3 uInk;         // dot color
uniform float uPitch;      // dot-grid cells across frame height
uniform float uDotSize;    // base dot radius in cell units, 0..0.5
uniform float uWaveAmp;    // radius modulation depth, 0..1
uniform float uSpeed;      // wave travel rate; 0 freezes
uniform float uShape;      // dot shape: 0 diamond, 1 circle, 2 square
uniform float uAngle;      // wave direction, radians
uniform float uCalm;       // 0..1 eases the waves at frame center (face zone)

in highp vec2 vUv;
out vec4 oColor;

// Antialias half-width in cell units; ~1px at the default pitch.
const float AA = 0.06;

void main() {
  // Aspect-correct, screen-centered coordinates (matches plasma/nebula).
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
  float centerDist = length(uv);

  vec2 luv = uv * uPitch;
  vec2 id = floor(luv);
  vec2 gv = fract(luv) - 0.5;
  // Wave phase is sampled at the CELL CENTER so a dot's radius is uniform
  // across its own pixels (true halftone, not a warped field).
  vec2 c = (id + 0.5) / uPitch;

  float t = uTime * uSpeed;
  vec2 dir1 = vec2(cos(uAngle), sin(uAngle));
  vec2 dir2 = vec2(cos(uAngle + 2.2), sin(uAngle + 2.2));
  // Two traveling waves at incommensurate frequencies: interference patterns
  // that drift forever without visibly repeating.
  float w = 0.5 + 0.25 * sin(dot(c, dir1) * 3.1 + t) + 0.25 * sin(dot(c, dir2) * 4.7 - t * 0.77);

  // uCalm: flatten the modulation toward its midpoint near frame center.
  float calm = uCalm * (1.0 - smoothstep(0.15, 0.62, centerDist));
  w = mix(w, 0.5, calm);

  float radius = uDotSize * mix(1.0 - uWaveAmp, 1.0 + uWaveAmp, w);

  // Blended distance metric, pow-free (variable-exponent pow lowers to
  // exp2+log2 on mobile): diamond (L1) -> circle (L2) -> square (Linf).
  vec2 q = abs(gv);
  float dDiamond = (q.x + q.y) * 0.7071;
  float dCircle = length(q);
  float dSquare = max(q.x, q.y);
  float d = (uShape < 1.0)
      ? mix(dDiamond, dCircle, clamp(uShape, 0.0, 1.0))
      : mix(dCircle, dSquare, clamp(uShape - 1.0, 0.0, 1.0));

  float m = smoothstep(radius + AA, radius - AA, d);
  vec3 color = mix(uPaper, uInk, m);

  // Opaque procedural background; the person is composited over it downstream.
  oColor = vec4(color, 1.0);
}
