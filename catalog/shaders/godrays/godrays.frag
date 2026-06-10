// God rays, pipeline form: a transparent ADDITIVE overlay layer. Ported from the
// Shadertoy original by simiancraft. Outputs PREMULTIPLIED rays
// (oColor = vec4(uLightColor * alpha, alpha)) so the layer compositor blends it
// additively over whatever is beneath; it does NOT sample the frame (no
// iChannel0); the compositor supplies "beneath".
//
// Every knob is a uniform, so a composite preset commands the full look (tint, speed,
// count, intensity, ...). uTime/uResolution follow the project convention; UV is
// vUv (bottom-left origin), and "top" is derived explicitly as 1.0 - uv.y, so the
// rays read from the top regardless of texture-origin convention. No loops, so no
// compile-time-constant constraints.

#version 300 es
precision highp float;

uniform float uTime;          // seconds, monotonically increasing
uniform vec2 uResolution;     // framebuffer size in pixels
uniform vec3 uLightColor;     // ray tint (linear-ish RGB, 0..1)
uniform float uRayCount;      // number of ray bands
uniform float uRaySpeed;      // drift speed
uniform float uRayIntensity;  // overall brightness / additive strength
uniform float uRaySoftness;   // edge falloff exponent (higher = crisper shafts)
uniform float uTopGlow;       // extra glow concentrated near the top
uniform float uFadeDistance;  // vertical falloff from the top
uniform float uWobbleAmount;  // horizontal wobble magnitude
uniform float uWobbleSpeed;   // wobble animation speed

in highp vec2 vUv;
out vec4 oColor;

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i.x + i.y * 57.0);
    float b = hash(i.x + 1.0 + i.y * 57.0);
    float c = hash(i.x + (i.y + 1.0) * 57.0);
    float d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    // vUv is already 0..1 with bottom-left origin; this is the Shadertoy `uv`.
    vec2 uv = vUv;

    float aspect = uResolution.x / uResolution.y;
    vec2 p = uv;
    p.x = (p.x - 0.5) * aspect + 0.5;

    float t = uTime;
    float fromTop = 1.0 - uv.y;

    float verticalFade = exp(-fromTop * uFadeDistance);
    float topGlow = exp(-fromTop * 8.0) * uTopGlow;

    float wobble =
        (noise(vec2(uv.y * 3.0, t * uWobbleSpeed)) - 0.5) * uWobbleAmount;

    float rayCoord = (p.x + wobble) * uRayCount;

    float raysA = sin(rayCoord + t * uRaySpeed);
    float raysB = sin(rayCoord * 1.73 - t * uRaySpeed * 0.7);

    float rays = raysA * 0.65 + raysB * 0.35;
    rays = rays * 0.5 + 0.5;
    rays = pow(rays, uRaySoftness);

    float shimmer = noise(vec2(uv.x * 10.0, uv.y * 4.0 - t * 0.3));
    rays *= mix(0.75, 1.25, shimmer);

    float alpha = rays * verticalFade * uRayIntensity;
    alpha += topGlow * uRayIntensity;
    alpha = clamp(alpha, 0.0, 1.0);

    // Premultiplied additive output: rgb already scaled by alpha.
    vec3 rayColor = uLightColor * alpha;
    oColor = vec4(rayColor, alpha);
}
