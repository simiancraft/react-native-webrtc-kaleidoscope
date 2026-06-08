// Light shaft: ONE volumetric light beam with dust motes drifting inside it, on a
// TRANSPARENT background (use blend 'additive'). The lightweight, interior-scene
// sibling of light-beams-and-motes: a single configurable shaft instead of three
// fixed ones, ~1/3 the beam cost and a smaller mote count, for making a static
// indoor image feel alive by matching its real light source.
//
// The shaft is authored as intuitive FLOAT params, not raw polygon points: a
// top center + width (where the light enters) and a bottom center + width (where
// it lands / fans). Lean is the offset between them. A preset sets these to sit
// the shaft over the image's light, and uShaftColor to match its hue; the motes
// take the shaft color. quadMask is DOUBLE-winding here (unlike #38's single-
// winding light-beams optimization) because tunable geometry cannot assume a
// fixed clockwise winding.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) bottom-left, (1, 1)
// top-right; this is the Shadertoy `uv` directly. Source points sit at y ~ 1.05
// (off the top), spread points at y ~ -0.05 (off the bottom), so the shaft reads
// top-to-bottom under y-up. Fully procedural: no input texture, so net texture
// flips are zero on every runtime; no gl_FragCoord is read.
//
// Alpha: STRAIGHT (non-premultiplied); oColor.rgb is accumulated independently of
// oColor.a, matching light-beams-and-motes / fireflies.
//
// Precision: highp float is REQUIRED. The hash1/hash2 RNG and the fract() mote
// scatter use the large 43758.5453123 sin multiplier; at mediump the mote
// distribution collapses to banded garbage.

#version 300 es
precision highp float;

uniform float uTime;            // seconds, monotonically increasing; range [0, inf)
uniform vec3 uShaftColor;       // the light's color; the motes take this too
uniform float uShaftTopX;       // horizontal center where the shaft enters (top), 0..1
uniform float uShaftTopWidth;   // shaft width at the top (the source)
uniform float uShaftBottomX;    // horizontal center where the shaft lands (bottom)
uniform float uShaftBottomWidth;// shaft width at the bottom (the fan); lean = bottomX - topX
uniform float uSpeed;           // animation rate; 1 = stock, 0 freezes the field
uniform float uBeamAlpha;       // beam fill strength (absolute)
uniform float uMoteAlpha;       // mote brightness (absolute)
uniform float uGlowSize;        // mote glow radius, in mote-size multiples
uniform float uBeamSoftness;    // beam polygon edge softness
uniform float uOverlayAlpha;    // overall overlay opacity, applied to the final alpha
uniform float uMoteCount;       // active motes (<= MOTE_COUNT); a coherent break trims the loop

in highp vec2 vUv;
out vec4 oColor;

// MOTE_COUNT must stay a compile-time constant (GLSL ES loop bound). A single
// interior shaft reads well with far fewer motes than the 3-beam field's 128.
#define MOTE_COUNT        48
#define DRIFT_SPEED       0.060
#define FALL_SPEED        0.012
#define SWIRL_AMOUNT      0.065
#define TURBULENCE        0.030
#define MOTE_SIZE_MIN     0.0013
#define MOTE_SIZE_MAX     0.0048

float hash1(float n) { return fract(sin(n) * 43758.5453123); }
vec2 hash2(float n) { return vec2(hash1(n + 11.17), hash1(n + 47.83)); }

float softMote(vec2 uv, vec2 center, float radius) {
    float d = length(uv - center);
    float q = d / radius;  // pow(q, 2.0) -> q*q
    return exp(-q * q);
}

// Soft convex quad mask. main() builds the quad in a fixed clockwise perimeter
// (top-left, top-right, bottom-right, bottom-left) with positive widths and the
// top always above the bottom, so the winding never flips and only the negative
// branch is ever live -- single-winding, four smoothsteps, like the #38 light-
// beams path. (An earlier double-winding form here was pure overhead.)
float quadMask(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d, float softness) {
    vec2 e0 = b - a;
    vec2 e1 = c - b;
    vec2 e2 = d - c;
    vec2 e3 = a - d;
    float s0 = e0.x * (p.y - a.y) - e0.y * (p.x - a.x);
    float s1 = e1.x * (p.y - b.y) - e1.y * (p.x - b.x);
    float s2 = e2.x * (p.y - c.y) - e2.y * (p.x - c.x);
    float s3 = e3.x * (p.y - d.y) - e3.y * (p.x - d.x);
    return
        smoothstep(-softness, softness, -s0) *
        smoothstep(-softness, softness, -s1) *
        smoothstep(-softness, softness, -s2) *
        smoothstep(-softness, softness, -s3);
}

// Subtle animated variation inside the beam.
float beamTexture(vec2 uv) {
    float t = uTime * uSpeed;
    float broadBands = 0.55 + 0.45 * sin(uv.x * 7.0 + uv.y * 4.0 + t * 0.06);
    float fineBands = 0.75 + 0.25 * sin(uv.x * 23.0 - uv.y * 11.0 + t * 0.11);
    return mix(0.65, 1.0, broadBands * fineBands);
}

float shaftAt(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
    return quadMask(p, a, b, c, d, uBeamSoftness) * beamTexture(p);
}

void main() {
    vec2 uv = vUv;

    // Build the shaft quad from the float params (perimeter order: top-left,
    // top-right, bottom-right, bottom-left).
    vec2 a = vec2(uShaftTopX - uShaftTopWidth * 0.5, 1.05);
    vec2 b = vec2(uShaftTopX + uShaftTopWidth * 0.5, 1.05);
    vec2 c = vec2(uShaftBottomX + uShaftBottomWidth * 0.5, -0.05);
    vec2 d = vec2(uShaftBottomX - uShaftBottomWidth * 0.5, -0.05);

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    float beam = shaftAt(uv, a, b, c, d);
    col += uShaftColor * beam * uBeamAlpha;
    alpha += beam * uBeamAlpha * 0.45;

    for (int n = 0; n < MOTE_COUNT; n++) {
        if (float(n) >= uMoteCount) break;  // runtime-tunable mote count (coherent break)
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

        float moteBeam = shaftAt(pos, a, b, c, d);
        if (moteBeam <= 0.001) {
            continue;
        }

        float mote = softMote(uv, pos, size);
        float core = softMote(uv, pos, size * 0.42);
        float glow = softMote(uv, pos, size * uGlowSize);

        float shimmer =
            0.72 + 0.28 * sin(uTime * uSpeed * mix(0.22, 0.95, hash1(seed + 9.0)) + seed);
        float strength = mix(0.05, 0.34, depth) * shimmer * moteBeam * uMoteAlpha;

        col += uShaftColor * glow * strength * 0.12;
        col += uShaftColor * mote * strength * 0.36;
        col += vec3(1.0) * core * strength * 0.10;

        alpha += glow * strength * 0.030;
        alpha += mote * strength * 0.105;
        alpha += core * strength * 0.110;
    }

    float haze = beam * beam * (0.6 + 0.4 * sin(uv.x * 8.0 + uv.y * 5.0 + uTime * uSpeed * 0.08));
    col += uShaftColor * haze * 0.018;
    alpha += haze * 0.010;

    alpha = clamp(alpha * uOverlayAlpha, 0.0, 1.0);
    oColor = vec4(col, alpha);
}
