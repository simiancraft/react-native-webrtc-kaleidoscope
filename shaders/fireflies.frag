// Fireflies (alias: motes): drifting glowing dots on a TRANSPARENT background.
// Shadertoy Image tab. Original simple overlay shader by simiancraft; to be
// adapted into the lib's generic shader channel (port iTime/iResolution/mainImage
// -> uTime/uResolution/main+oColor at integration).
//
// NOTE: this one already emits alpha (fragColor.a follows brightness), so it is a
// genuine transparent overlay -- the in-front-of-subject "sandwich" candidate for
// the layer compositor, and a clean test of premultiplied-alpha edge blending.
//
// Tuned looks so far (each define-set becomes a uniform preset once wired in;
// FIREFLY_COUNT stays a compile-time constant since it is the loop bound):
//   "default" (active): COUNT 36, GLOW 0.035, DOT 0.006, SPEED 0.35, TWINKLE 2.5
//   "subtle"          : COUNT 22, GLOW 0.025, DOT 0.004, SPEED 0.18, TWINKLE 1.6

#define FIREFLY_COUNT 36   // More = denser field, slower. (subtle 22)
#define GLOW_SIZE 0.035    // Radius of each firefly glow. (subtle 0.025)
#define DOT_SIZE 0.006     // Bright center size. (subtle 0.004)
#define SPEED 0.35         // Movement speed. (subtle 0.18)
#define TWINKLE 2.5        // Fade in/out speed. (subtle 1.6)

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 fireflyPos(float id, float t) {
    // Each firefly gets a stable base position.
    vec2 base = vec2(hash(id * 12.7), hash(id * 31.3));

    // Each gets a unique looping drift.
    float a = hash(id * 5.1) * 6.28318;
    float b = hash(id * 9.7) * 6.28318;

    vec2 drift = vec2(
        sin(t * SPEED + a),
        cos(t * SPEED * 0.73 + b)
    ) * 0.12;

    return fract(base + drift);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    // Correct aspect ratio so dots stay circular.
    vec2 p = uv;
    p.x *= iResolution.x / iResolution.y;

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    for (int i = 0; i < FIREFLY_COUNT; i++) {
        float id = float(i);

        vec2 pos = fireflyPos(id, iTime);

        // Match aspect correction applied to p.
        pos.x *= iResolution.x / iResolution.y;

        float d = length(p - pos);

        // Individual fade pattern.
        // Some fireflies brighten while others dim.
        float phase = hash(id * 17.1) * 6.28318;
        float pulse = 0.5 + 0.5 * sin(iTime * TWINKLE + phase);

        // Make them spend more time dim than bright.
        pulse = pow(pulse, 2.5);

        // Soft glow plus small bright core.
        float glow = exp(-d * d / (GLOW_SIZE * GLOW_SIZE));
        float core = smoothstep(DOT_SIZE, 0.0, d);

        float intensity = pulse * (glow * 0.55 + core * 1.4);

        vec3 fireflyColor = vec3(1.0, 0.82, 0.32);

        color += fireflyColor * intensity;

        // Alpha follows brightness.
        alpha += intensity * 0.55;
    }

    alpha = clamp(alpha, 0.0, 1.0);
    color = clamp(color, 0.0, 1.0);

    fragColor = vec4(color, alpha);
}
