// Fireflies: drifting glowing dots on a TRANSPARENT background, an
// overlay layer (use blend 'additive'). Ported from the Shadertoy prototype to
// this repo's GLSL ES 3.00 multi-runtime convention: iTime/iResolution/mainImage
// -> uTime/uResolution/main+oColor, and the GLOW/DOT/SPEED/TWINKLE #defines are
// now uniforms. FIREFLY_COUNT stays a compile-time constant (GLSL ES loop bound).
//
// UV convention: matches passthrough.vert. vUv = (0, 0) bottom-left, (1, 1)
// top-right; this is the Shadertoy `uv` directly. Fully procedural (no input
// texture), so net texture flips are zero on every runtime; no gl_FragCoord.
//
// Alpha: STRAIGHT (non-premultiplied) -- oColor.a follows brightness, color is
// accumulated independently. This is the single source; build:shaders codegens
// it to every runtime (web FIREFLIES_FRAG_SRC, Android, iOS .metalsrc).
//
// Precision: highp float (the sin()*43758.5453123 hash bands at mediump).

#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uGlowSize;
uniform float uDotSize;
uniform float uSpeed;
uniform float uTwinkle;
uniform vec3 uColor;

in highp vec2 vUv;
out vec4 oColor;

#define FIREFLY_COUNT 36

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

vec2 fireflyPos(float id, float t) {
    vec2 base = vec2(hash(id * 12.7), hash(id * 31.3));
    float a = hash(id * 5.1) * 6.28318;
    float b = hash(id * 9.7) * 6.28318;
    vec2 drift = vec2(sin(t * uSpeed + a), cos(t * uSpeed * 0.73 + b)) * 0.12;
    return fract(base + drift);
}

void main() {
    vec2 uv = vUv;
    vec2 p = uv;
    p.x *= uResolution.x / uResolution.y;
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    for (int i = 0; i < FIREFLY_COUNT; i++) {
        float id = float(i);
        vec2 pos = fireflyPos(id, uTime);
        pos.x *= uResolution.x / uResolution.y;
        float d = length(p - pos);
        float phase = hash(id * 17.1) * 6.28318;
        float pulse = 0.5 + 0.5 * sin(uTime * uTwinkle + phase);
        pulse = pulse * pulse * sqrt(pulse);  // pow(pulse, 2.5): a non-integer pow is ~2 transcendentals on mobile; this is 1 sqrt + 2 muls
        float glow = exp(-d * d / (uGlowSize * uGlowSize));
        float core = smoothstep(uDotSize, 0.0, d);
        float intensity = pulse * (glow * 0.55 + core * 1.4);
        color += uColor * intensity;
        alpha += intensity * 0.55;
    }
    alpha = clamp(alpha, 0.0, 1.0);
    color = clamp(color, 0.0, 1.0);
    oColor = vec4(color, alpha);
}
