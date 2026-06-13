// Data-mesh: a mid-2000s corporate digital-futurism background. A large smooth
// three-dimensional wave surface drawn as a fine wireframe of perspective rows,
// with glowing nodes at the grid intersections, bent into broad hills, valleys,
// and saddle curves and receding into deep virtual space. Electric crest glow,
// soft turquoise bloom, faint atmospheric haze on the far rows, and a sparse
// drift of particles (one of which is the lone accent mote). Enterprise box-art
// and OEM-wallpaper idiom (Microsoft / Dell / SQL Server / Alienware era), clean
// negative space for a logo. An opaque BACKGROUND layer; the masked subject
// composites over it downstream.
//
// Technique (performance-first): NO raymarch, NO fbm, NO variable-exponent pow.
// The surface is a stack of ROWS perspective-spaced ridgelines. Every row samples
// ONE shared 2D wave field H(worldX, depth, time), so adjacent rows are continuous
// and read as a single coherent surface rather than independent lines. A row's
// screen height is its perspective baseline plus H scaled by that row's
// perspective factor. Per pixel the bounded ROWS loop accumulates an analytic
// ribbon + strut + node glow; an early-out skips any row whose baseline is outside
// this pixel's vertical reach BEFORE the sines run, so most rows cost a compare.
// Keep the mesh loose: ROWS and uGridX are deliberately modest, not hi-def.
//
// Overdrive surface: the color set is the mood (uBgTop/uBgBottom gradient,
// uLineColor mid tint, uCrestColor peak highlight, uHazeColor far atmosphere,
// uAccentColor the one restrained accent). Structural dials (uWaveScale/Amp/Speed,
// uGridX, uHorizon, uFarScale, uSlant) set composition and motion; uNodeMix /
// uStrutMix grade the lines-vs-dots reading; uGlow / uHaze / uParticles / uAccent
// set the additive extras. uCalm eases the additive glow near frame center, where
// the masked subject's face sits.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) bottom-left, (1, 1)
// top-right; fragCoord is reconstructed as vUv * uResolution and the centered,
// aspect-correct uv divides by height. Fully procedural: no input texture, no
// gl_FragCoord, so net texture flips are zero on every runtime (web/Android/Metal
// alike).
//
// Cross-target correctness: the only divide is worldX = uv.x / persp, and persp is
// clamped to max(persp, uFarScale) with uFarScale >= 0.05, so it never approaches
// zero (no Inf/NaN, no highp-vs-mediump divergence at a vanishing line). No fwidth
// or derivatives (depth fade and haze are analytic, not screen-space). No
// variable-exponent pow, no atan, no gl_FragCoord, no arrays, no extensions. ROWS
// and PARTICLES stay compile-time constants (GLSL ES loop bounds); the dynamic
// continue/break inside are uniform-flow and survive the SPIR-V -> MSL step.
//
// Precision: highp float throughout. worldX grows up to ~0.9 / uFarScale and feeds
// fract() for the column grid, so the field needs the range and the front-to-far
// dynamic range; mediump would band the gradient and alias the far columns.

#version 300 es
precision highp float;

uniform float uTime;        // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;   // framebuffer size in pixels; both components > 0
uniform vec3 uBgTop;        // background gradient color at the top of frame
uniform vec3 uBgBottom;     // background gradient color at the bottom of frame
uniform vec3 uLineColor;    // mid wireframe-line tint (the trough/body color)
uniform vec3 uCrestColor;   // crest highlight color (brightest along the peaks)
uniform vec3 uHazeColor;    // atmospheric haze tint on the far rows
uniform vec3 uAccentColor;  // the one restrained accent (e.g. enterprise red)
uniform float uWaveScale;   // wave-field spatial frequency; lower = looser, broader hills
uniform float uWaveAmp;     // vertical wave displacement amount (near rows)
uniform float uWaveSpeed;   // animation rate; 0 freezes the surface
uniform float uGridX;       // column-grid density across the surface; keep loose
uniform float uHorizon;     // horizon height in uv.y units (rows converge toward it)
uniform float uFarScale;    // perspective scale of the farthest row, 0.05..0.5 (>0)
uniform float uSlant;       // diagonal tilt; raises the right side for corner composition
uniform float uLineWidth;   // wireframe line half-width (smaller = finer, sharper)
uniform float uNodeMix;     // 0..1 emphasis of glowing intersection nodes (dot reading)
uniform float uStrutMix;    // 0..1 emphasis of vertical struts (wireframe reading)
uniform float uGlow;        // overall additive mesh-glow / bloom strength
uniform float uHaze;        // atmospheric far-haze strength
uniform float uParticles;   // floating-particle intensity; 0 disables the field
uniform float uAccent;      // lone accent-mote intensity; 0 disables it
uniform float uCalm;        // 0..1 eases the additive glow at frame center (face zone)

in highp vec2 vUv;
out vec4 oColor;

// ROWS / PARTICLES must stay compile-time constants (GLSL ES loop bounds). ROWS is
// kept modest on purpose (loose mesh); perspective bunching toward the horizon
// makes it read as far more lines than it costs.
#define ROWS                20
#define PARTICLES           14
#define WAVE_DEPTH_SPAN     4.5   // world-depth the eased row range maps across
#define COL_SHARP           48.0  // column-stripe sharpness in cell-phase units
#define Y_NEAR             (-0.62) // nearest row baseline (just below the bottom edge)

// Cheap stable hash for the particle field (highp; the 43758.5453 multiplier
// bands under mediump, same note as clouds/nebula).
float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453123);
}

// The shared surface. x is perspective world-x, z is eased world-depth, t is time.
// A small sum of sines whose x/z cross terms produce the hills, valleys, and
// saddles; bounded to roughly [-1.6, 1.6].
float waveField(float x, float z, float t) {
  float h = 0.0;
  h += sin(x * 1.00 + z * 0.55 + t) * 0.60;
  h += sin(x * 0.55 - z * 0.95 - t * 0.70) * 0.45;
  h += sin((x + z) * 0.45 + t * 0.40 + 1.7) * 0.40; // diagonal ridges -> saddles
  h += sin(x * 1.70 - z * 0.30 + t * 1.20) * 0.16;  // fine ripple
  return h;
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y; // centered, aspect-correct

  // Background: smooth vertical gradient, no texture. g = 0 bottom .. 1 top.
  float g = clamp(uv.y + 0.5, 0.0, 1.0);
  vec3 col = mix(uBgBottom, uBgTop, g);

  // Ease additive glow near the frame center (the subject's face sits there).
  float calm = 1.0 - uCalm * (1.0 - smoothstep(0.18, 0.62, length(uv)));

  float t = uTime * uWaveSpeed;
  float horizon = clamp(uHorizon, -0.2, 0.45);

  // Line-glow widths from the half-width. The core line keeps the one exp() (its
  // sharp gaussian is the wireframe signature); the bloom halo and the vertical
  // strut use rational falloffs (1/(1+k·dy^2)) instead of more exp() calls, which
  // are ~8x-weighted transcendentals on the hot per-row path. The node reuses the
  // core exp directly. Net: 2 exp/row (core + column), down from 5.
  float coreSharp = 1.0 / max(uLineWidth * uLineWidth, 1e-5);
  float haloK = coreSharp * 0.14;  // rational-bloom width (matches the old halo half-width)
  float strutK = coreSharp * 0.14; // rational vertical-bridge width

  vec3 mesh = vec3(0.0);
  vec3 haze = vec3(0.0);

  for (int i = 0; i < ROWS; i++) {
    float rowT = float(i) / float(ROWS - 1);     // 0 near .. 1 far
    float om = 1.0 - rowT;
    float f = 1.0 - om * om;                      // eased depth: rows bunch toward horizon
    float persp = mix(1.0, uFarScale, f);
    persp = max(persp, uFarScale);                // guard the divide (uFarScale > 0)

    // Row baseline in screen-y, with a diagonal tilt for corner composition.
    float baseY = mix(Y_NEAR, horizon, f) + uv.x * uSlant * persp;

    // Early-out: skip the sines for any row that cannot reach this pixel. Margin
    // covers the max wave displacement plus the strut's vertical bridge.
    float reach = persp * uWaveAmp * 1.7 + uLineWidth * 3.0 + 0.06;
    if (abs(uv.y - baseY) > reach) continue;

    float worldX = uv.x / persp;
    float h = waveField(worldX * uWaveScale, f * WAVE_DEPTH_SPAN, t);
    float surfY = baseY + persp * uWaveAmp * h;
    float dy = uv.y - surfY;

    // Crest factor: peaks of the field glow white, troughs stay the line tint.
    float crest = smoothstep(0.2, 1.4, h);

    // Horizontal ribbon: sharp gaussian core (the line) + rational bloom halo.
    float dy2 = dy * dy;
    float core = exp(-dy2 * coreSharp);
    float ribbon = core + 0.22 / (1.0 + dy2 * haloK);

    // Column grid: one bright stripe per cell of worldX. cph = 0 at the stripe.
    float cph = fract(worldX * uGridX) - 0.5;
    float colLine = exp(-cph * cph * COL_SHARP);

    // Vertical strut (rational falloff in y so it bridges toward neighbors, gated
    // by the column) and the intersection node (core line x column -> a glowing
    // dot; reuses the core exp, no extra transcendental).
    float strut = colLine / (1.0 + dy2 * strutK);
    float node = core * colLine;

    // Atmospheric fade: far rows dim and tint toward the haze color.
    float fade = om * om;                          // 1 near .. 0 far
    float lit = ribbon + uStrutMix * strut + uNodeMix * node * 2.0;
    vec3 lineCol = mix(uLineColor, uCrestColor, crest);

    // Crest-dominant brightness: troughs stay dim, peaks carry the illumination.
    mesh += lineCol * lit * fade * (0.35 + 1.0 * crest);
    haze += uHazeColor * ribbon * (1.0 - fade) * crest;
  }

  col += mesh * uGlow * calm;
  col += haze * uHaze * calm;

  // Sparse floating particles; index 0 is the lone accent mote (independent of
  // uParticles so an accent can show with the particle field off).
  if (uParticles > 0.0 || uAccent > 0.0) {
    vec3 motes = vec3(0.0);
    for (int p = 0; p < PARTICLES; p++) {
      float fp = float(p);
      vec2 seed = vec2(hash11(fp * 1.7 + 0.3), hash11(fp * 3.1 + 1.9));
      vec2 ppos = (seed * 2.0 - 1.0) * vec2(0.92, 0.46);
      ppos.x += sin(uTime * 0.07 + fp * 2.3) * 0.03;
      ppos.y += cos(uTime * 0.05 + fp * 1.7) * 0.03;
      float twinkle = 0.5 + 0.5 * sin(uTime * (0.6 + hash11(fp * 5.0)) + fp * 4.0);
      float pd = length(uv - ppos);
      float glint = exp(-pd * pd * 2300.0) * twinkle;
      vec3 pcol = (p == 0) ? uAccentColor * uAccent : uCrestColor * uParticles;
      motes += pcol * glint;
    }
    col += motes * calm;
  }

  // Soft highlight rolloff: fold the additive foreground pile-up into clean white
  // crests instead of a clipped slab; leaves the dark gradient essentially intact.
  col = vec3(1.0) - exp(-col);

  oColor = vec4(col, 1.0);
}
