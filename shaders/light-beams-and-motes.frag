// Light beams and motes: dust motes drifting inside independently colored polygon
// light beams, on a TRANSPARENT background (use blend 'additive'). Ported from a
// Shadertoy prototype (mainImage/iTime/iResolution/fragCoord) to this repo's
// GLSL ES 3.00 multi-runtime convention.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) bottom-left, (1, 1)
// top-right; the Shadertoy `uv = fragCoord / iResolution` is exactly vUv, so it
// is substituted directly. Beam SOURCE points sit at y ~ 1.05 (off the top) and
// SPREAD points at y = 0 (bottom), so the shafts read top-to-bottom under y-up.
// Fully procedural: no input texture, so there is no frame-origin handoff to
// flip; net texture flips are zero on every runtime. No gl_FragCoord is read.
//
// Precision: highp float is REQUIRED. The hash1/hash2 RNG and the fract() mote
// scatter use a large sin() multiplier (43758.5453123); at mediump those
// products collapse to banded garbage and the mote distribution dies. Same
// reasoning as simianlights/blur.
//
// Alpha: STRAIGHT (non-premultiplied) — oColor.rgb is accumulated independently
// of oColor.a, preserving the prototype's look. If the layer compositor expects
// premultiplied input (godrays emits premultiplied), premultiply at integration;
// this matches the staged state of the other overlays (fireflies emits straight
// alpha too). Documented here so the choice is decided up front, not in QA.
//
// Beam geometry and per-beam colors are compile-time const (the fixed shape of
// the effect). The tunable surface is the uniform set below; MOTE_COUNT stays a
// compile-time constant because it is the loop bound (a uniform bound would not
// survive the SPIR-V -> MSL transpile).

#version 300 es
precision highp float;

uniform float uTime;          // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;     // framebuffer size in pixels; both components > 0
uniform vec3 uColor;          // overall tint / color grade; [1,1,1] = untinted
uniform float uSpeed;         // animation rate; 1.0 = stock, 0 freezes the field
uniform float uBeamAlpha;     // beam fill strength (absolute); stock 0.18
uniform float uMoteAlpha;     // mote brightness (absolute); stock 0.48
uniform float uGlowSize;      // mote glow radius, in mote-size multiples
uniform float uBeamSoftness;  // beam polygon edge softness
uniform float uOverlayAlpha;  // overall overlay opacity, applied to final alpha

in highp vec2 vUv;
out vec4 oColor;

// ---------- Mote controls (internal constants) ----------
#define MOTE_COUNT        128   // loop bound: compile-time constant, not a uniform
#define DRIFT_SPEED       0.060
#define FALL_SPEED        0.012
#define SWIRL_AMOUNT      0.065
#define TURBULENCE        0.030
#define MOTE_SIZE_MIN     0.0013
#define MOTE_SIZE_MAX     0.0048

// ================================================================
// BEAM POINT NAMING
//
// Each beam is a 4-point polygon/trapezoid.
//
// SOURCE_LEFT  / SOURCE_RIGHT:
//   The narrow end where light enters the image (near the top).
// SPREAD_RIGHT / SPREAD_LEFT:
//   The wider end where the beam lands/spreads (lower in the image).
//
// Polygon order: SOURCE_LEFT -> SOURCE_RIGHT -> SPREAD_RIGHT -> SPREAD_LEFT.
// ================================================================

// Beam 1: reddish, from top-left toward lower-center/right; wider at the base.
const vec2 BEAM_1_SOURCE_LEFT  = vec2(0.02, 1.05);
const vec2 BEAM_1_SOURCE_RIGHT = vec2(0.17, 1.05);
const vec2 BEAM_1_SPREAD_RIGHT = vec2(0.68, 0.00);
const vec2 BEAM_1_SPREAD_LEFT  = vec2(0.36, 0.00);
const vec3 BEAM_1_COLOR = vec3(1.00, 0.42, 0.32);
const float BEAM_1_STRENGTH = 0.72;

// Beam 2: greenish, from center-top downward; slight perspective flare.
const vec2 BEAM_2_SOURCE_LEFT  = vec2(0.45, 1.05);
const vec2 BEAM_2_SOURCE_RIGHT = vec2(0.57, 1.05);
const vec2 BEAM_2_SPREAD_RIGHT = vec2(0.73, 0.00);
const vec2 BEAM_2_SPREAD_LEFT  = vec2(0.33, 0.00);
const vec3 BEAM_2_COLOR = vec3(0.54, 1.00, 0.62);
const float BEAM_2_STRENGTH = 0.48;

// Beam 3: cool violet-blue, from top-right toward lower-center/left; wider base.
const vec2 BEAM_3_SOURCE_LEFT  = vec2(0.82, 1.05);
const vec2 BEAM_3_SOURCE_RIGHT = vec2(0.99, 1.05);
const vec2 BEAM_3_SPREAD_RIGHT = vec2(0.70, 0.00);
const vec2 BEAM_3_SPREAD_LEFT  = vec2(0.38, 0.00);
const vec3 BEAM_3_COLOR = vec3(0.55, 0.66, 1.00);
const float BEAM_3_STRENGTH = 0.58;

float hash1(float n) {
    return fract(sin(n) * 43758.5453123);
}

vec2 hash2(float n) {
    return vec2(hash1(n + 11.17), hash1(n + 47.83));
}

float softMote(vec2 uv, vec2 center, float radius) {
    float d = length(uv - center);
    return exp(-pow(d / radius, 2.0));
}

// Soft convex quad mask. Order follows the polygon perimeter:
// source-left, source-right, spread-right, spread-left.
float quadMask(
    vec2 p,
    vec2 sourceLeft,
    vec2 sourceRight,
    vec2 spreadRight,
    vec2 spreadLeft,
    float softness
) {
    vec2 a = sourceLeft;
    vec2 b = sourceRight;
    vec2 c = spreadRight;
    vec2 d = spreadLeft;

    vec2 e0 = b - a;
    vec2 e1 = c - b;
    vec2 e2 = d - c;
    vec2 e3 = a - d;

    float s0 = e0.x * (p.y - a.y) - e0.y * (p.x - a.x);
    float s1 = e1.x * (p.y - b.y) - e1.y * (p.x - b.x);
    float s2 = e2.x * (p.y - c.y) - e2.y * (p.x - c.x);
    float s3 = e3.x * (p.y - d.y) - e3.y * (p.x - d.x);

    float insidePositive =
        smoothstep(-softness, softness, s0) *
        smoothstep(-softness, softness, s1) *
        smoothstep(-softness, softness, s2) *
        smoothstep(-softness, softness, s3);

    float insideNegative =
        smoothstep(-softness, softness, -s0) *
        smoothstep(-softness, softness, -s1) *
        smoothstep(-softness, softness, -s2) *
        smoothstep(-softness, softness, -s3);

    return max(insidePositive, insideNegative);
}

// Subtle animated variation inside each beam.
float beamTexture(vec2 uv, float seed) {
    float t = uTime * uSpeed;

    float broadBands =
        0.55 + 0.45 * sin(uv.x * 7.0 + uv.y * 4.0 + t * 0.06 + seed);

    float fineBands =
        0.75 + 0.25 * sin(uv.x * 23.0 - uv.y * 11.0 + t * 0.11 + seed * 2.7);

    return mix(0.65, 1.0, broadBands * fineBands);
}

float beamAmount(
    vec2 uv,
    vec2 sourceLeft,
    vec2 sourceRight,
    vec2 spreadRight,
    vec2 spreadLeft,
    float strength,
    float seed
) {
    return
        quadMask(
            uv,
            sourceLeft,
            sourceRight,
            spreadRight,
            spreadLeft,
            uBeamSoftness
        ) *
        strength *
        beamTexture(uv, seed);
}

float totalBeamAmount(vec2 uv) {
    float beam1 = beamAmount(
        uv,
        BEAM_1_SOURCE_LEFT, BEAM_1_SOURCE_RIGHT, BEAM_1_SPREAD_RIGHT, BEAM_1_SPREAD_LEFT,
        BEAM_1_STRENGTH, 1.0
    );

    float beam2 = beamAmount(
        uv,
        BEAM_2_SOURCE_LEFT, BEAM_2_SOURCE_RIGHT, BEAM_2_SPREAD_RIGHT, BEAM_2_SPREAD_LEFT,
        BEAM_2_STRENGTH, 8.0
    );

    float beam3 = beamAmount(
        uv,
        BEAM_3_SOURCE_LEFT, BEAM_3_SOURCE_RIGHT, BEAM_3_SPREAD_RIGHT, BEAM_3_SPREAD_LEFT,
        BEAM_3_STRENGTH, 14.0
    );

    return clamp(beam1 + beam2 + beam3, 0.0, 1.0);
}

vec3 beamColorAt(vec2 uv) {
    float beam1 = beamAmount(
        uv,
        BEAM_1_SOURCE_LEFT, BEAM_1_SOURCE_RIGHT, BEAM_1_SPREAD_RIGHT, BEAM_1_SPREAD_LEFT,
        BEAM_1_STRENGTH, 1.0
    );

    float beam2 = beamAmount(
        uv,
        BEAM_2_SOURCE_LEFT, BEAM_2_SOURCE_RIGHT, BEAM_2_SPREAD_RIGHT, BEAM_2_SPREAD_LEFT,
        BEAM_2_STRENGTH, 8.0
    );

    float beam3 = beamAmount(
        uv,
        BEAM_3_SOURCE_LEFT, BEAM_3_SOURCE_RIGHT, BEAM_3_SPREAD_RIGHT, BEAM_3_SPREAD_LEFT,
        BEAM_3_STRENGTH, 14.0
    );

    vec3 weightedColor =
        BEAM_1_COLOR * beam1 +
        BEAM_2_COLOR * beam2 +
        BEAM_3_COLOR * beam3;

    float total = max(beam1 + beam2 + beam3, 0.0001);

    return weightedColor / total;
}

void main() {
    // vUv is already 0..1 with bottom-left origin; this is the Shadertoy `uv`.
    vec2 uv = vUv;

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    float beams = totalBeamAmount(uv);
    vec3 beamColor = beamColorAt(uv);

    col += beamColor * beams * uBeamAlpha;
    alpha += beams * uBeamAlpha * 0.45;

    // Integer-counted loop: the original `for (float i = 0.0; i < MOTE_COUNT; i++)`
    // with a float counter is replaced by an int counter over a compile-time
    // constant bound. `i` is reconstructed as float(n), so the per-mote seeds and
    // motion are bit-identical to the prototype; only the loop form changes.
    for (int n = 0; n < MOTE_COUNT; n++) {
        float i = float(n);
        float seed = i * 91.73;

        vec2 pos = hash2(seed);

        float depth = hash1(seed + 3.0);
        float size = mix(MOTE_SIZE_MIN, MOTE_SIZE_MAX, depth);
        float speed = mix(0.45, 1.35, hash1(seed + 5.0));

        float t = uTime * uSpeed * speed;

        pos.x += sin(t * DRIFT_SPEED * 1.7 + seed) * SWIRL_AMOUNT;
        pos.x += sin(t * DRIFT_SPEED * 3.9 + seed * 0.41) * TURBULENCE;
        pos.x += uTime * uSpeed * DRIFT_SPEED * mix(-0.10, 0.10, hash1(seed + 8.0));

        pos.y += sin(t * DRIFT_SPEED * 2.4 + seed * 0.37) * SWIRL_AMOUNT * 0.55;
        pos.y += sin(t * DRIFT_SPEED * 5.1 + seed * 1.73) * TURBULENCE * 0.65;
        pos.y -= uTime * uSpeed * FALL_SPEED * speed;

        pos = fract(pos);

        float moteBeamAmount = totalBeamAmount(pos);
        if (moteBeamAmount <= 0.001) {
            continue;
        }

        vec3 moteColor = beamColorAt(pos);

        float mote = softMote(uv, pos, size);
        float core = softMote(uv, pos, size * 0.42);
        float glow = softMote(uv, pos, size * uGlowSize);

        float shimmer =
            0.72 +
            0.28 * sin(uTime * uSpeed * mix(0.22, 0.95, hash1(seed + 9.0)) + seed);

        float strength =
            mix(0.05, 0.34, depth) *
            shimmer *
            moteBeamAmount *
            uMoteAlpha;

        col += moteColor * glow * strength * 0.12;
        col += moteColor * mote * strength * 0.36;
        col += vec3(1.0) * core * strength * 0.10;

        alpha += glow * strength * 0.030;
        alpha += mote * strength * 0.105;
        alpha += core * strength * 0.110;
    }

    float haze =
        beams *
        beams *
        (0.6 + 0.4 * sin(uv.x * 8.0 + uv.y * 5.0 + uTime * uSpeed * 0.08));

    col += beamColor * haze * 0.018;
    alpha += haze * 0.010;

    // Overall tint / color grade.
    col *= uColor;

    alpha = clamp(alpha * uOverlayAlpha, 0.0, 1.0);

    oColor = vec4(col, alpha);
}
