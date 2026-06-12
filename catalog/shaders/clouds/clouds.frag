// Clouds: raymarched clouds with an art-directable time-of-day palette + exposure.
// A full-frame opaque BACKGROUND layer (alpha 1). Ported from the Shadertoy
// prototype to this repo's GLSL ES 3.00 multi-runtime convention: the palette and
// shape params that were Shadertoy globals/#defines are now uniforms, and
// iTime/iResolution/mainImage -> uTime/uResolution/main+oColor. STEPS stays a
// compile-time constant (GLSL ES loop bound).
//
// Slab-bounded march (issue #37): the clouds live in 0 < p.y < 3 (the height
// mask is 0 outside it), so cloudDensity() returns 0 before the 4-octave fbm()
// when p.y leaves the slab, and the march breaks once the ray exits it. Both
// skip only zero-contribution samples; output is unchanged. The march itself
// uses a distance-growing step (see main) so 32 steps cover the old 48-step
// range; the growth factor also weights per-sample opacity to keep optical
// depth per unit distance consistent.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) bottom-left, (1, 1)
// top-right; fragCoord is reconstructed as vUv * uResolution. Fully procedural
// (no input texture), so net texture flips are zero on every runtime; no
// gl_FragCoord is read.
//
// Precision: highp float (the rand()/hash() chain uses the 43758.5453123
// multiplier; mediump bands it). This source is codegen'd by build:shaders into
// CLOUDS_FRAG_SRC in web-driver/shaders.generated.ts (the web compositor's copy).
//
// Working time-of-day palettes + shape looks live in shaders/clouds.presets.md.
// Quick reference (uStepSize / uCloudSpeed): clear 0.20/0.6, billowy 0.10/0.2,
// wispy 0.25/0.2.

#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uSkyLowColor;
uniform vec3 uSkyHighColor;
uniform vec3 uCloudLightColor;
uniform vec3 uCloudDarkColor;
uniform float uExposure;
uniform float uStepSize;
uniform float uCloudSpeed;
uniform float uCloudScale;
uniform float uDensity;
uniform float uCoverage;
uniform float uSoftness;

in highp vec2 vUv;
out vec4 oColor;

// STEPS must stay a compile-time constant (GLSL ES loop bound).
// 32 (was 48; issue #37): the distance-growing step in main() keeps the
// marched range, so fewer steps buys speed instead of clipping the horizon.
#define STEPS 32

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float rand(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(
            mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
            f.y),
        mix(
            mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
            f.y),
        f.z);
}

// 4 octaves (was 5; issue #37): the 5th octave is fine wisp detail the
// smoothstep(uCoverage, uCoverage + uSoftness, n) threshold mostly eats; each
// octave is 8 hash() calls per sample, so this is a flat -20% on the march.
float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

float cloudDensity(vec3 p) {
    p += vec3(uTime * uCloudSpeed, 0.0, uTime * uCloudSpeed * 0.35);
    // Outside the slab the height mask is 0, so the sample is 0; bail before fbm.
    if (p.y <= 0.0 || p.y >= 3.0) return 0.0;
    float n = fbm(p * uCloudScale);
    float bottom = smoothstep(0.0, 0.7, p.y);
    float top = smoothstep(3.0, 1.2, p.y);
    float heightMask = bottom * top;
    float cloud = smoothstep(uCoverage, uCoverage + uSoftness, n);
    return cloud * heightMask;
}

void main() {
    vec2 fragCoord = vUv * uResolution;
    vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
    vec3 ro = vec3(0.0, 1.2, -4.0);
    vec3 rd = normalize(vec3(uv, 1.5));
    float skyGradient = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 skyColor = mix(uSkyLowColor, uSkyHighColor, skyGradient);
    vec3 accum = vec3(0.0);
    float alpha = 0.0;
    float t = rand(fragCoord) * uStepSize;
    for (int i = 0; i < STEPS; i++) {
        vec3 p = ro + rd * t;
        // The slab is crossed monotonically in t; once past it, all samples are 0.
        if (rd.y > 0.0 && p.y >= 3.0) break;
        if (rd.y < 0.0 && p.y <= 0.0) break;
        float d = cloudDensity(p);
        // Distance-growing step (issue #37): far clouds are small on screen and
        // tolerate coarser sampling, so the step stretches with t. 32 growing
        // steps reach slightly past where 48 uniform steps did, spending the
        // samples up close where banding would show. growth also scales the
        // per-sample opacity so optical depth per unit distance stays consistent
        // with the uniform-step tuning the presets were dialed against.
        float growth = 1.0 + t * 0.15;
        if (d > 0.01) {
            float light = smoothstep(0.4, 2.8, p.y);
            vec3 sampleColor = mix(uCloudDarkColor, uCloudLightColor, light);
            float a = min(d * uDensity * growth, 1.0);
            accum += (1.0 - alpha) * sampleColor * a;
            alpha += (1.0 - alpha) * a;
        }
        t += uStepSize * growth;
        if (alpha > 0.95) break;
    }
    vec3 color = mix(skyColor, accum, alpha);
    color *= uExposure;
    color = pow(color, vec3(0.9));
    oColor = vec4(color, 1.0);
}
