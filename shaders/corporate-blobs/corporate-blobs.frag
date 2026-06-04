// Corporate blobs: large decorative edge/vignette blobs in flat brand colors,
// slowly drifting, breathing, and morphing. A transparent OVERLAY layer (premul
// output; the blobs sit over whatever is beneath). Ported from a Shadertoy
// prototype to this repo's GLSL ES 3.00 multi-runtime convention.
//
// Compositor handoff: the prototype sampled iChannel0 and had a BACKGROUND_ON toggle
// to composite over it. In this layer compositor a shader never samples the
// frame; the compositor supplies "beneath", so this is ported as the
// BACKGROUND_ON=0 (alpha-only) form: no iChannel0, blobs out with alpha.
//
// Alpha: PREMULTIPLIED. The front-to-back accumulation builds rgb already scaled
// by coverage (gelColor * a), so oColor.rgb is premultiplied by oColor.a, same
// convention as godrays. Kept byte-for-byte in sync with CORPORATE_BLOBS_FRAG_SRC
// in web-driver/effects/layer-shaders.ts (the web compositor's copy).
//
// UV convention: matches passthrough.vert. vUv = (0, 0) bottom-left, (1, 1)
// top-right; fragCoord is reconstructed as vUv * uResolution. The Shadertoy uv =
// fragCoord / iResolution is bottom-left too, so the centered space p = uv*2-1
// (aspect-corrected on x) survives the port unflipped. Fully procedural: no input
// texture, no gl_FragCoord; net texture flips are zero on every runtime.
//
// Precision: highp float (matches the layer-shader family; the trig/smoothstep
// math here is mediump-safe, but highp keeps it uniform with its siblings).
//
// BLOB_COUNT stays a compile-time constant (GLSL ES loop bound).

#version 300 es
precision highp float;

uniform float uTime;          // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;     // framebuffer size in pixels; both components > 0
uniform vec3 uColor;          // overall tint / color grade; [1,1,1] = stock colors
uniform float uGlobalAlpha;   // overall blob opacity; stock 0.58
uniform float uScale;         // global blob size multiplier; stock 2.55
uniform float uEdgePull;      // pushes blobs outward from center; stock 0.32
uniform float uCenterClear;   // radius around center that repels blobs; stock 0.42
uniform float uMotionAmount;  // positional drift magnitude; 1.0 = stock, 0 = still
uniform float uMotionSpeed;   // drift + morph rate; 1.0 = stock, 0 freezes motion
uniform float uEdgeSoftness;  // blob edge falloff; stock 0.024
// Per-blob base colors, multiplied by uColor at output. Defaults (the stock
// brand palette) live in CORPORATE_BLOBS_CONTROLS.
uniform vec3 uBlobColor1;     // stock: light blue
uniform vec3 uBlobColor2;     // stock: dark green
uniform vec3 uBlobColor3;     // stock: yellow
uniform vec3 uBlobColor4;     // stock: orange
uniform vec3 uBlobColor5;     // stock: light green
uniform vec3 uBlobColor6;     // stock: magenta
uniform vec3 uBlobColor7;     // stock: brown
uniform vec3 uBlobColor8;     // stock: dark blue

in highp vec2 vUv;
out vec4 oColor;

// BLOB_COUNT must stay a compile-time constant (GLSL ES loop bound).
#define BLOB_COUNT            8

// Internal animation constants (not tunable; keep the look coherent).
#define CENTER_CLEAR_PUSH     0.34
#define SCALE_PULSE_AMOUNT    0.10
#define SCALE_PULSE_SPEED     0.42
#define ROTATION_SWAY_AMOUNT  0.12
#define ROTATION_SWAY_SPEED   0.11
#define SHAPE_MORPH_SPEED     1.00

struct Blob {
    vec2 pos;
    float scale;
    float opacity;
    float speed;
    float drift;
    float rotation;
    float variant;
    vec3 color;
};

Blob getBlob(float i) {
    if (i < 0.5) return Blob(vec2(-1.18, -0.55), 0.62, 0.48, 0.22, 0.14, 0.10, 0.0, uBlobColor1);
    if (i < 1.5) return Blob(vec2( 1.12, -0.35), 0.66, 0.40, 0.18, 0.13, 1.00, 1.0, uBlobColor2);
    if (i < 2.5) return Blob(vec2( 0.95,  0.88), 0.58, 0.44, 0.20, 0.14, 2.20, 2.0, uBlobColor3);
    if (i < 3.5) return Blob(vec2(-0.98,  0.82), 0.56, 0.38, 0.16, 0.12, 0.70, 3.0, uBlobColor4);
    if (i < 4.5) return Blob(vec2( 1.28,  0.28), 0.50, 0.34, 0.24, 0.11, 1.80, 4.0, uBlobColor5);
    if (i < 5.5) return Blob(vec2(-0.25, -1.12), 0.54, 0.36, 0.19, 0.11, 2.60, 5.0, uBlobColor6);
    if (i < 6.5) return Blob(vec2(-1.30,  0.10), 0.48, 0.30, 0.17, 0.12, 0.40, 6.0, uBlobColor7);
    return             Blob(vec2( 0.28,  1.18), 0.52, 0.30, 0.14, 0.10, 0.90, 7.0, uBlobColor8);
}

mat2 rotate2d(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

float variantRadius(float angle, float variant, float phase) {
    float r = 1.0;

    if (variant < 0.5) {
        r += 0.115 * sin(angle * 2.0 + 0.20 + phase * 0.20);
        r += 0.075 * sin(angle * 3.0 - 1.10 - phase * 0.13);
        r += 0.035 * sin(angle * 5.0 + 2.00 + phase * 0.09);
    } else if (variant < 1.5) {
        r += 0.090 * sin(angle * 2.0 - 0.80 + phase * 0.18);
        r += 0.105 * sin(angle * 3.0 + 0.70 - phase * 0.10);
        r += 0.030 * sin(angle * 6.0 - 1.50 + phase * 0.08);
    } else if (variant < 2.5) {
        r += 0.130 * sin(angle * 2.0 + 1.10 + phase * 0.16);
        r += 0.060 * sin(angle * 4.0 - 0.30 - phase * 0.12);
        r += 0.045 * sin(angle * 5.0 + 2.80 + phase * 0.07);
    } else if (variant < 3.5) {
        r += 0.080 * sin(angle * 2.0 + 2.30 + phase * 0.14);
        r += 0.120 * sin(angle * 3.0 - 0.40 - phase * 0.11);
        r += 0.040 * sin(angle * 7.0 + 1.10 + phase * 0.06);
    } else if (variant < 4.5) {
        r += 0.035 * sin(angle * 2.0 + 0.10 + phase * 0.12);
        r += 0.030 * sin(angle * 3.0 + 1.80 - phase * 0.09);
        r += 0.020 * sin(angle * 5.0 - 0.90 + phase * 0.05);
    } else if (variant < 5.5) {
        r += 0.145 * sin(angle * 2.0 - 1.30 + phase * 0.17);
        r += 0.070 * sin(angle * 3.0 + 2.40 - phase * 0.11);
        r += 0.035 * sin(angle * 5.0 + 0.20 + phase * 0.08);
    } else if (variant < 6.5) {
        r += 0.045 * sin(angle * 2.0 + 1.70 + phase * 0.10);
        r += 0.035 * sin(angle * 4.0 - 2.10 - phase * 0.08);
        r += 0.025 * sin(angle * 6.0 + 0.50 + phase * 0.05);
    } else {
        r += 0.170 * sin(angle * 2.0 + 2.80 + phase * 0.20);
        r += 0.090 * sin(angle * 3.0 - 1.90 - phase * 0.15);
        r += 0.055 * sin(angle * 5.0 + 0.80 + phase * 0.09);
    }

    return r;
}

vec2 applyCenterRepulsor(vec2 center) {
    float d = length(center);
    vec2 dir = normalize(center + vec2(0.0001, 0.0001));

    center += dir * uEdgePull;

    float centerInfluence = 1.0 - smoothstep(uCenterClear, uCenterClear + 0.35, d);
    center += dir * centerInfluence * CENTER_CLEAR_PUSH;

    return center;
}

float animatedScale(float baseScale, float blobIndex, float blobSpeed) {
    float localPhase =
        uTime * SCALE_PULSE_SPEED * (0.65 + blobSpeed * 1.35) +
        blobIndex * 2.731;

    float pulseA = sin(localPhase);
    float pulseB = sin(localPhase * 0.47 + blobIndex * 5.13) * 0.45;

    float scaleMultiplier = 1.0 + (pulseA + pulseB) * SCALE_PULSE_AMOUNT;

    return baseScale * max(0.05, scaleMultiplier);
}

float blobMask(vec2 p, vec2 center, Blob b, float phase, float liveScale) {
    vec2 q = p - center;

    vec2 squash = vec2(
        1.0 + 0.14 * sin(b.variant * 1.91),
        1.0 + 0.14 * cos(b.variant * 2.37)
    );

    float rotationSway =
        sin(uTime * ROTATION_SWAY_SPEED * (0.6 + b.speed) + b.variant * 3.0) *
        ROTATION_SWAY_AMOUNT;

    q = rotate2d(b.rotation + rotationSway) * q;
    q /= squash;

    float angle = atan(q.y, q.x);
    float dist = length(q);

    float r = liveScale * uScale * 0.5 * variantRadius(angle, b.variant, phase);

    return 1.0 - smoothstep(r, r + uEdgeSoftness, dist);
}

void main() {
    vec2 uv = vUv;

    vec2 p = uv * 2.0 - 1.0;
    p.x *= uResolution.x / uResolution.y;

    vec3 blobCol = vec3(0.0);
    float blobAlpha = 0.0;

    // Integer-counted loop over a compile-time bound; i is reconstructed as
    // float(n), so the per-blob lookups and phases match the prototype.
    for (int n = 0; n < BLOB_COUNT; n++) {
        float i = float(n);
        Blob b = getBlob(i);

        float phase =
            uTime * b.speed * uMotionSpeed * SHAPE_MORPH_SPEED +
            i * 4.137;

        vec2 center = b.pos;

        center.x += sin(phase * 0.41 + i * 1.70) * b.drift * uMotionAmount;
        center.x += sin(phase * 0.19 + i * 3.10) * b.drift * uMotionAmount * 0.45;
        center.y += cos(phase * 0.33 + i * 2.30) * b.drift * uMotionAmount * 0.75;
        center.y += sin(phase * 0.17 + i * 4.40) * b.drift * uMotionAmount * 0.35;

        center = applyCenterRepulsor(center);

        float liveScale = animatedScale(b.scale, i, b.speed);
        float mask = blobMask(p, center, b, phase, liveScale);

        float inner = pow(mask, 1.35);
        float rim = mask * (1.0 - smoothstep(0.45, 1.0, mask));

        vec3 gelColor = b.color * inner + b.color * rim * 0.18;
        float a = mask * b.opacity * uGlobalAlpha;

        blobCol += gelColor * a * (1.0 - blobAlpha);
        blobAlpha += a * (1.0 - blobAlpha);
    }

    // Premultiplied output; tint grades the (premultiplied) color, not alpha.
    oColor = vec4(blobCol * uColor, blobAlpha);
}
