// Clouds: raymarched clouds with art-directable time-of-day color + exposure and
// an optional transparent (clouds-only) output. Original shader by simiancraft.
// Shadertoy Image-tab form, kept previewable: the palette/exposure are GLOBALS
// here so stock Shadertoy can run it; the lib port swaps them to the real
// uniforms documented in the block below and iTime/iResolution/mainImage ->
// uTime/uResolution/main+oColor. STEPS stays a compile-time constant (loop bound).
//
// The working time-of-day palettes + shape looks live in shaders/clouds.presets.md
// (so we don't fish for them). Quick reference:
//   shape (STEP_SIZE / CLOUD_SPEED): clear 0.20/0.6, billowy 0.10/0.2, wispy 0.25/0.2
//   layer: TRANSPARENT_BACKGROUND 0 = opaque sky+clouds (background layer);
//          1 = clouds-only PREMULTIPLIED alpha (overlay; composite premult, no re-gamma)

#define STEPS 64
#define STEP_SIZE 0.20
#define CLOUD_SPEED 0.20
#define CLOUD_SCALE 0.65
#define DENSITY 0.07
#define COVERAGE 0.44
#define SOFTNESS 0.15

#define TRANSPARENT_BACKGROUND 0
// 0 = render sky + clouds.
// 1 = render clouds only with alpha.


// ─────────────────────────────────────────────
// "UNIFORM-LIKE" PARAMETERS
//
// In Shadertoy these are globals.
// In a real engine, these become uniforms:
//
// uniform vec3 uSkyLowColor;
// uniform vec3 uSkyHighColor;
// uniform vec3 uCloudLightColor;
// uniform vec3 uCloudDarkColor;
// uniform float uExposure;
//
// Then the shader logic below does not need to change.
// (Working values for day / sunset / night: see shaders/clouds.presets.md.)
// ─────────────────────────────────────────────

// Deep night default
vec3 uSkyLowColor     = vec3(0.02, 0.03, 0.08);
vec3 uSkyHighColor    = vec3(0.10, 0.14, 0.28);

vec3 uCloudLightColor = vec3(0.38, 0.42, 0.55);
vec3 uCloudDarkColor  = vec3(0.08, 0.10, 0.16);

float uExposure = 0.75;

// Try these instead:
//
// Bright day:
// vec3 uSkyLowColor     = vec3(0.48, 0.68, 0.95);
// vec3 uSkyHighColor    = vec3(0.85, 0.93, 1.00);
// vec3 uCloudLightColor = vec3(1.00, 0.97, 0.90);
// vec3 uCloudDarkColor  = vec3(0.62, 0.67, 0.76);
// float uExposure = 1.0;
//
// Sunset:
// vec3 uSkyLowColor     = vec3(0.95, 0.38, 0.18);
// vec3 uSkyHighColor    = vec3(0.35, 0.18, 0.55);
// vec3 uCloudLightColor = vec3(1.00, 0.62, 0.35);
// vec3 uCloudDarkColor  = vec3(0.35, 0.16, 0.28);
// float uExposure = 0.9;


// ─────────────────────────────────────────────
// BASIC HASH / NOISE
// ─────────────────────────────────────────────

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float rand(vec2 p) {
    // Jitters ray start per pixel to hide banding.
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    // Smooth interpolation between grid corners.
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(
            mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
            f.y
        ),
        mix(
            mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
            f.y
        ),
        f.z
    );
}

float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;

    // More octaves = more cloud detail, slightly slower.
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.03;
        a *= 0.5;
    }

    return v;
}


// ─────────────────────────────────────────────
// CLOUD DENSITY FIELD
// ─────────────────────────────────────────────

float cloudDensity(vec3 p) {
    // Move noise over time, making the clouds drift.
    p += vec3(iTime * CLOUD_SPEED, 0.0, iTime * CLOUD_SPEED * 0.35);

    float n = fbm(p * CLOUD_SCALE);

    // Horizontal cloud layer.
    float bottom = smoothstep(0.0, 0.7, p.y);
    float top    = smoothstep(3.0, 1.2, p.y);
    float heightMask = bottom * top;

    // Noise-to-density threshold.
    float cloud = smoothstep(COVERAGE, COVERAGE + SOFTNESS, n);

    return cloud * heightMask;
}


// ─────────────────────────────────────────────
// MAIN SHADER
// ─────────────────────────────────────────────

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Camera.
    vec3 ro = vec3(0.0, 1.2, -4.0);
    vec3 rd = normalize(vec3(uv, 1.5));

    // Sky gradient.
    float skyGradient = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);

    vec3 skyColor = mix(
        uSkyLowColor,
        uSkyHighColor,
        skyGradient
    );

    vec3 accum = vec3(0.0);
    float alpha = 0.0;

    // Anti-banding jitter.
    float t = rand(fragCoord) * STEP_SIZE;

    for (int i = 0; i < STEPS; i++) {
        vec3 p = ro + rd * t;

        float d = cloudDensity(p);

        if (d > 0.01) {
            // Fake vertical cloud lighting.
            float light = smoothstep(0.4, 2.8, p.y);

            vec3 sampleColor = mix(
                uCloudDarkColor,
                uCloudLightColor,
                light
            );

            float a = d * DENSITY;

            // Front-to-back compositing.
            accum += (1.0 - alpha) * sampleColor * a;
            alpha += (1.0 - alpha) * a;
        }

        t += STEP_SIZE;

        if (alpha > 0.95) break;
    }

#if TRANSPARENT_BACKGROUND
    // Clouds only.
    fragColor = vec4(accum * uExposure, alpha);
#else
    // Sky + clouds.
    vec3 color = mix(skyColor, accum, alpha);

    // Runtime-style exposure control.
    color *= uExposure;

    // Mild gamma-ish lift.
    color = pow(color, vec3(0.9));

    fragColor = vec4(color, 1.0);
#endif
}
