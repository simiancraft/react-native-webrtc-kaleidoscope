// SIMIANCRAFT Deadlights V2 "Deadlights nebula"
// Procedural full-screen backdrop animation for https://simiancraft.com/
// Jesse Harlin, 2020. MIT license.
// Ported from a ShaderToy prototype (mainImage/iTime/iResolution) to this
// repo's GLSL ES 3.00 multi-runtime convention. Tuned high: speed/glow
// cranked relative to V1.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) at bottom-left,
// (1, 1) at top-right. fragCoord is reconstructed as vUv * uResolution so
// this stays on the vUv convention and never reads gl_FragCoord (whose Y
// orientation flips between OpenGL and Metal). This is a fully procedural
// background: no input texture, so there is no texture-origin handoff to
// flip; the only orientation that matters is vUv, which the vertex shader
// already pins. Net texture flips: zero on every runtime.
//
// Precision: highp float is REQUIRED, not mediump. The PseudoRandomizer
// hash and the fract() size/color tricks use large multipliers (123.45,
// 345.67, 1356.33, 2150.0, 3000.0, 3430.0). At mediump (10-bit mantissa on
// mobile GPUs) fract() of those products collapses to banded garbage,
// destroying the star distribution. Same reasoning composite-blur.frag gives
// for keeping vUv highp, applied to the whole hash chain here.

#version 300 es
precision highp float;

uniform float uTime;          // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;     // framebuffer size in pixels; both components > 0
uniform vec3 uColor;          // overall tint / color grade; [1,1,1] = untinted
uniform float uBrightness;    // final glow multiplier; 1.0 = stock
uniform float uSpeed;         // drift + rotation rate; 1.0 = stock, 0 freezes
uniform float uTwinkleSpeed;  // star color-cycle rate; 1.0 = stock
uniform float uScale;         // starfield zoom / density; >1 = more, smaller stars
uniform float uStarGlow;      // star-core size; 1.0 = stock

in highp vec2 vUv;
out vec4 oColor;

const float PI = 3.14159265;
const float MIN_DIVIDE = 64.0;
const float MAX_DIVIDE = 0.01;
// Number of stacked starfield layers. Compile-time constant so the layer
// loop has a fixed integer bound (cross-compile-safe; no float loop counter).
// 8 (was 12) for low-end-mobile cost (issue #39); the work is linear in the
// count and dimByDensity rebalances per-star brightness automatically.
const int STARFIELD_LAYERS_COUNT = 8;

mat2 Rotate(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float Star(vec2 uv, float flaresize, float rotAngle, float randomN) {
  float d = length(uv);
  // The concentric fade at the bottom is exactly 0 for d >= 1.0; the star is
  // invisible there, so skip everything (issue #39: a large share of the 3x3
  // neighbor sweep lands outside this radius; the cull is output-identical).
  if (d >= 1.0) return 0.0;
  // Star core. Guard the division: length(uv) can be exactly 0 at a cell
  // center, which yields inf/NaN under Metal. max(d, 1e-4) caps the core
  // brightness without visibly changing the look (the concentric
  // smoothstep fade below already clamps it).
  float starcore = 0.05 * uStarGlow / max(d, 1e-4);
  // Flares exist only on the brightest stars: flaresize is exactly 0 below the
  // smoothstep(0.9, 1.0, size) knee (~90% of cells), and both Rotates feed
  // nothing but the flares. Skipping the block is output-identical, and
  // flaresize is constant per cell, so the branch is coherent (issue #39).
  if (flaresize > 0.0) {
    uv *= Rotate(-2.0 * PI * rotAngle);
    float flareMax = 1.0;

    // flares
    float starflares = max(0.0, flareMax - abs(uv.x * uv.y * 3000.0));
    starcore += starflares * flaresize;
    uv *= Rotate(PI * 0.25);
    starflares = max(0.0, flareMax - abs(uv.x * uv.y * 3000.0));
    starcore += starflares * 0.3 * flaresize;
  }
  // light can't go forever, fade it concentrically.
  starcore *= smoothstep(1.0, 0.05, d);
  return starcore;
}

float PseudoRandomizer(vec2 p) {
  // not really random, but it looks random.
  p = fract(p * vec2(123.45, 345.67));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 StarFieldLayer(vec2 uv, float rotAngle) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  float deltaTimeTwinkle = uTime * 0.35 * uTwinkleSpeed;

  // sweep the 8 neighbors plus the home cell so stars are not clipped at
  // cell borders. Constant 3x3 bounds.
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));

      float randomN = PseudoRandomizer(id + offset); // 0..1
      float randoX = randomN - 0.5;
      float randoY = fract(randomN * 45.0) - 0.5;
      vec2 randomPosition = gv - offset - vec2(randoX, randoY);
      // fract trick: random sizes
      float size = fract(randomN * 1356.33);
      float flareSwitch = smoothstep(0.9, 1.0, size);
      float star = Star(randomPosition, flareSwitch, rotAngle, randomN);

      // fract trick: random colors
      float randomStarColorSeed = fract(randomN * 2150.0) * (3.0 * PI) * deltaTimeTwinkle;
      vec3 color = sin(vec3(0.7, 0.3, 0.9) * randomStarColorSeed);

      // compress
      color = color * (0.4 * sin(deltaTimeTwinkle)) + 0.6;
      // filter
      color = color * vec3(1.0, 0.1, 0.9 + size);
      float dimByDensity = 15.0 / float(STARFIELD_LAYERS_COUNT);
      col += star * size * color * dimByDensity;
    }
  }

  return col;
}

void main() {
  // ShaderToy fragCoord, reconstructed from vUv (see header).
  vec2 fragCoord = vUv * uResolution;

  // Normalized pixel coordinates centered at screen middle.
  vec2 uv = (fragCoord - 0.5 * uResolution.xy) / uResolution.y;

  float deltaTime = uTime * 0.01 * uSpeed;

  vec3 col = vec3(0.0);

  float rotAngle = deltaTime * 0.09;

  // Layer accumulation. Integer-counted loop replacing the original
  // `for (float i = 0.0; i < 1.0; i += 1.0/COUNT)`. With n in [0, COUNT),
  // i = n/COUNT reproduces the exact same {0, 1/N, 2/N, ...} sequence and
  // the same iteration count, so visual output is unchanged; only the loop
  // form is cross-compile-safe.
  for (int n = 0; n < STARFIELD_LAYERS_COUNT; n++) {
    float i = float(n) / float(STARFIELD_LAYERS_COUNT);
    float layerDepth = fract(i + deltaTime);
    float layerScale = mix(MIN_DIVIDE, MAX_DIVIDE, layerDepth);
    float layerFader = layerDepth * smoothstep(0.1, 1.1, layerDepth);
    float layerOffset = i * (3430.0 + fract(i));
    mat2 layerRot = Rotate(rotAngle * i * -10.0);
    uv *= layerRot;
    vec2 starfieldUv = uv * layerScale * uScale + layerOffset;
    col += StarFieldLayer(starfieldUv, rotAngle) * layerFader;
  }

  // Glow + color grade, then opaque procedural background.
  col *= uBrightness * uColor;
  oColor = vec4(col, 1.0);
}
