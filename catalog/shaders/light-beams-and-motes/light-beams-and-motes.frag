// Light beams and motes: dust motes drifting inside three independently positioned,
// colored, and lit polygon light beams, on a TRANSPARENT background (use blend
// 'additive'). Ported from a Shadertoy prototype to this repo's GLSL ES 3.00
// multi-runtime convention; the beam geometry/color/strength, once compile-time
// const, are now per-beam UNIFORMS so a preset aims each beam at a real light.
//
// Each beam is a 4-point polygon authored ROW-MAJOR (TL, TR, BL, BR under y-up) --
// the natural editor order -- with its own color, fill strength (alpha), and
// on/off flag. main() re-orders each quad to a clockwise
// perimeter (TL, TR, BR, BL = [0], [1], [3], [2]) for the edge test.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) bottom-left, (1, 1)
// top-right; the Shadertoy `uv = fragCoord / iResolution` is exactly vUv. Beam
// source anchors sit at y ~ 1.05 (off the top), spread anchors near y = 0, so the
// shafts read top-to-bottom under y-up. Fully procedural: no input texture, so net
// texture flips are zero on every runtime; no gl_FragCoord is read.
//
// Precision: highp float is REQUIRED. The hash1/hash2 RNG and the fract() mote
// scatter use a large sin() multiplier (43758.5453123); at mediump those products
// collapse to banded garbage and the mote distribution dies. Same reasoning as
// simianlights/composite-blur.
//
// Alpha: STRAIGHT (non-premultiplied); oColor.rgb is accumulated independently of
// oColor.a, preserving the prototype's look. MOTE_COUNT stays a compile-time
// constant because it is the loop bound (a uniform bound would not survive the
// SPIR-V -> MSL transpile).

#version 300 es
precision highp float;

uniform float uTime;          // seconds, monotonically increasing; range [0, inf)
uniform float uSpeed;         // animation rate; 1.0 = stock, 0 freezes the field
uniform float uBeamSoftness;  // beam polygon edge softness
uniform float uOverlayAlpha;  // overall overlay opacity, applied to final alpha

// Per-beam: a row-major quad (TL, TR, BL, BR; y-up), a color, a fill strength
// (absolute), and an on/off flag. A disabled beam's quadMask + sins do not execute
// at all (the flag is uniform, so the branch is coherent across every fragment) --
// that is how you stop paying for beams you are not using.
uniform vec2 uBeam1Poly[4];
uniform vec3 uBeam1Color;
uniform float uBeam1Alpha;
uniform float uBeam1On;
uniform vec2 uBeam2Poly[4];
uniform vec3 uBeam2Color;
uniform float uBeam2Alpha;
uniform float uBeam2On;
uniform vec2 uBeam3Poly[4];
uniform vec3 uBeam3Color;
uniform float uBeam3Alpha;
uniform float uBeam3On;

uniform float uMoteAlpha;     // mote brightness (absolute)
uniform float uGlowSize;      // mote glow radius, in mote-size multiples
uniform float uMoteCount;     // active motes (<= MOTE_COUNT); a coherent break trims the loop

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

float hash1(float n) {
    return fract(sin(n) * 43758.5453123);
}

vec2 hash2(float n) {
    return vec2(hash1(n + 11.17), hash1(n + 47.83));
}

float softMote(vec2 uv, vec2 center, float radius) {
    float d = length(uv - center);
    float q = d / radius;  // pow(q, 2.0) -> q*q; spirv-opt does not strength-reduce it
    return exp(-q * q);
}

// Soft convex quad mask, winding-AGNOSTIC: the corners are user-draggable, so the
// perimeter can wind either way. A point is inside when it is on the same side of
// all four edges, whichever side that is; product the positive-side smoothsteps and
// the negative-side ones and keep the larger.
float quadMask(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d, float softness) {
    vec2 e0 = b - a;
    vec2 e1 = c - b;
    vec2 e2 = d - c;
    vec2 e3 = a - d;
    float s0 = e0.x * (p.y - a.y) - e0.y * (p.x - a.x);
    float s1 = e1.x * (p.y - b.y) - e1.y * (p.x - b.x);
    float s2 = e2.x * (p.y - c.y) - e2.y * (p.x - c.x);
    float s3 = e3.x * (p.y - d.y) - e3.y * (p.x - d.x);
    float inNeg =
        smoothstep(-softness, softness, -s0) *
        smoothstep(-softness, softness, -s1) *
        smoothstep(-softness, softness, -s2) *
        smoothstep(-softness, softness, -s3);
    float inPos =
        smoothstep(-softness, softness, s0) *
        smoothstep(-softness, softness, s1) *
        smoothstep(-softness, softness, s2) *
        smoothstep(-softness, softness, s3);
    return max(inNeg, inPos);
}

// Subtle animated variation inside each beam.
float beamTexture(vec2 uv, float seed) {
    float t = uTime * uSpeed;
    float broadBands = 0.55 + 0.45 * sin(uv.x * 7.0 + uv.y * 4.0 + t * 0.06 + seed);
    float fineBands = 0.75 + 0.25 * sin(uv.x * 23.0 - uv.y * 11.0 + t * 0.11 + seed * 2.7);
    return mix(0.65, 1.0, broadBands * fineBands);
}

// Geometric coverage of one row-major beam quad at uv (mask * texture, 0..~1), with
// the row-major -> perimeter reorder folded in. Independent of the beam's alpha.
float beamShape(vec2 uv, vec2 poly[4], float seed) {
    return quadMask(uv, poly[0], poly[1], poly[3], poly[2], uBeamSoftness) * beamTexture(uv, seed);
}

// Evaluate the three beams once. Returns the GEOMETRIC coverage sum (used to gate +
// brighten motes and to drive the haze, so per-beam alpha never dims the motes);
// writes `color` (the geometry-weighted beam hue, for fill and motes) and `litSum`
// (the alpha-weighted amount, the actual fill brightness/opacity).
float evalBeams(vec2 uv, out vec3 color, out float litSum) {
    float a1 = 0.0;
    float a2 = 0.0;
    float a3 = 0.0;
    if (uBeam1On > 0.5) a1 = beamShape(uv, uBeam1Poly, 1.0);
    if (uBeam2On > 0.5) a2 = beamShape(uv, uBeam2Poly, 8.0);
    if (uBeam3On > 0.5) a3 = beamShape(uv, uBeam3Poly, 14.0);

    float geomSum = a1 + a2 + a3;
    color = (uBeam1Color * a1 + uBeam2Color * a2 + uBeam3Color * a3) / max(geomSum, 0.0001);
    litSum = a1 * uBeam1Alpha + a2 * uBeam2Alpha + a3 * uBeam3Alpha;
    return geomSum;
}

// Accumulate the dust motes for ALL on beams in ONE loop. Each mote is round-
// robined to an on beam (mote n -> the (n mod nActive)-th on beam) and spawned in
// THAT beam's (u,v) space: every mote lands in a beam, takes the beam's color, and
// gets a cheap (u,v) edge falloff -- no screen-space scatter to cull, no per-mote
// quadMask. n and nActive are uniform across fragments, so the beam pick is
// COHERENT (same for every pixel), not a divergent per-pixel branch. Motes drift
// ALONG the beam (fall in v, swirl in u) and wrap, fading at the boundaries so the
// wrap is never a visible pop. Total mote count is uMoteCount regardless of how
// many beams are on -- the on beams share the budget.
void addMotes(vec2 uv, inout vec3 col, inout float alpha) {
    float nActive = uBeam1On + uBeam2On + uBeam3On;  // on-flags are 0/1
    if (nActive < 0.5) return;                        // no beams -> no motes

    // Motes may spill past the polygon edge by ~softness so the soft fringe is
    // populated; the (u,v) falloff dims them there.
    float fuzz = clamp(uBeamSoftness * 2.0, 0.03, 0.35);
    float slot = 0.0;  // round-robin cursor over the on beams (a wrapped counter, no per-mote mod)

    for (int n = 0; n < MOTE_COUNT; n++) {
        if (float(n) >= uMoteCount) break;  // runtime-tunable mote count (coherent break)
        float seed = float(n) * 91.73;

        // Round-robin: this mote goes to the slot-th on beam. Walk the beams,
        // counting on ones; the slot-th match wins.
        float picked = 0.0;
        vec2 tl = vec2(0.0);
        vec2 tr = vec2(0.0);
        vec2 bl = vec2(0.0);
        vec2 br = vec2(0.0);
        vec3 color = vec3(0.0);
        if (uBeam1On > 0.5) {
            if (abs(picked - slot) < 0.5) {
                tl = uBeam1Poly[0]; tr = uBeam1Poly[1]; bl = uBeam1Poly[2]; br = uBeam1Poly[3];
                color = uBeam1Color;
            }
            picked += 1.0;
        }
        if (uBeam2On > 0.5) {
            if (abs(picked - slot) < 0.5) {
                tl = uBeam2Poly[0]; tr = uBeam2Poly[1]; bl = uBeam2Poly[2]; br = uBeam2Poly[3];
                color = uBeam2Color;
            }
            picked += 1.0;
        }
        if (uBeam3On > 0.5) {
            if (abs(picked - slot) < 0.5) {
                tl = uBeam3Poly[0]; tr = uBeam3Poly[1]; bl = uBeam3Poly[2]; br = uBeam3Poly[3];
                color = uBeam3Color;
            }
            picked += 1.0;
        }

        float depth = hash1(seed + 3.0);
        float size = mix(MOTE_SIZE_MIN, MOTE_SIZE_MAX, depth);
        float speed = mix(0.45, 1.35, hash1(seed + 5.0));
        float t = uTime * uSpeed * speed;

        // (u,v) in beam space; drift = swirl in u, fall in v. fract wraps within
        // the beam, so a mote that falls out the spread end reappears at the source.
        vec2 g = hash2(seed);
        g.x += sin(t * DRIFT_SPEED * 1.7 + seed) * SWIRL_AMOUNT;
        g.x += sin(t * DRIFT_SPEED * 3.9 + seed * 0.41) * TURBULENCE;
        g.y += uTime * uSpeed * FALL_SPEED * speed * 6.0;
        g.y += sin(t * DRIFT_SPEED * 2.4 + seed * 0.37) * SWIRL_AMOUNT * 0.55;
        g = fract(g);

        // Expand to [-fuzz, 1+fuzz] so motes populate the soft fringe, then map
        // bilinearly onto the quad.
        vec2 q = g * (1.0 + 2.0 * fuzz) - fuzz;
        vec2 pos = mix(mix(tl, tr, q.x), mix(bl, br, q.x), q.y);

        // Cheap soft-edge falloff in (u,v), replacing the per-mote quadMask.
        float edge =
            smoothstep(0.0, fuzz, q.x) * smoothstep(0.0, fuzz, 1.0 - q.x) *
            smoothstep(0.0, fuzz, q.y) * smoothstep(0.0, fuzz, 1.0 - q.y);

        float mote = softMote(uv, pos, size);
        float core = softMote(uv, pos, size * 0.42);
        float glow = softMote(uv, pos, size * uGlowSize);

        float shimmer =
            0.72 + 0.28 * sin(uTime * uSpeed * mix(0.22, 0.95, hash1(seed + 9.0)) + seed);
        float strength = mix(0.15, 1.0, depth) * shimmer * edge * uMoteAlpha;

        col += color * glow * strength * 0.12;
        col += color * mote * strength * 0.36;
        col += vec3(1.0) * core * strength * 0.10;

        alpha += glow * strength * 0.030;
        alpha += mote * strength * 0.105;
        alpha += core * strength * 0.110;

        slot += 1.0;
        if (slot >= nActive) slot = 0.0;  // wrap the round-robin cursor
    }
}

void main() {
    // vUv is already 0..1 with bottom-left origin; this is the Shadertoy uv.
    vec2 uv = vUv;

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    vec3 beamColor;
    float litSum;
    float cover = evalBeams(uv, beamColor, litSum);

    col += beamColor * litSum;       // litSum carries each beam's per-beam alpha
    alpha += litSum * 0.45;

    // One loop; each mote is round-robined into an on beam and spawned there.
    addMotes(uv, col, alpha);

    float haze =
        cover * cover * (0.6 + 0.4 * sin(uv.x * 8.0 + uv.y * 5.0 + uTime * uSpeed * 0.08));
    col += beamColor * haze * 0.018;
    alpha += haze * 0.010;

    alpha = clamp(alpha * uOverlayAlpha, 0.0, 1.0);
    oColor = vec4(col, alpha);
}
