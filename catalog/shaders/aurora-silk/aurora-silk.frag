// Aurora silk: translucent ribbon bands warped by low-frequency noise,
// drifting diagonally over a soft two-stop gradient; spans the late-2000s OS
// swoosh through the modern SaaS gradient. An opaque BACKGROUND layer
// (issue #61).
//
// Overdrive surface: the palette is the big lever; uStyle morphs the whole
// aesthetic from flat paper-cut bands (hard edges, paint-over) to glowing
// silk (soft edges, additive); uRibbons, uAngle, and uSpeed set composition
// and energy. uCalm eases the ribbons near frame center, where the masked
// subject's face sits.
//
// Cost: a fixed-bound ribbon loop (MAX_RIBBONS = 5, dynamic break on
// uRibbons) of one 1D value noise (two hashes + a smooth mix) and two sines
// per ribbon. No 2D noise, no pow.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) at bottom-left,
// (1, 1) at top-right. fragCoord is reconstructed as vUv * uResolution; no
// gl_FragCoord. Fully procedural: no input texture, zero net texture flips on
// every runtime.
//
// Precision: highp float. The hash11 uses the 43758.5453123 multiplier;
// mediump bands it (same reasoning as nebula's hash chain).

#version 300 es
precision highp float;

uniform float uTime;       // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;  // framebuffer size in pixels; both components > 0
uniform vec3 uColorLow;    // gradient color at the flow's low side
uniform vec3 uColorHigh;   // gradient color at the flow's high side
uniform vec3 uRibbonColor; // ribbon tint; shades blend toward uColorHigh
uniform float uRibbons;    // visible ribbon count, 1..5 (MAX_RIBBONS)
uniform float uSoftness;   // ribbon edge softness, 0..1
uniform float uAngle;      // flow direction, radians
uniform float uSpeed;      // drift rate; 0 freezes
uniform float uStyle;      // 0 flat paper-cut .. 1 glowing silk
uniform float uCalm;       // 0..1 eases ribbons at frame center (face zone)

in highp vec2 vUv;
out vec4 oColor;

const int MAX_RIBBONS = 5;

float hash11(float n) {
  return fract(sin(n) * 43758.5453123);
}

// 1D value noise: smooth, cheap, non-repeating drift source per ribbon.
float vnoise(float x, float seed) {
  float i = floor(x);
  float f = fract(x);
  float a = hash11(i + seed);
  float b = hash11(i + 1.0 + seed);
  return mix(a, b, f * f * (3.0 - 2.0 * f));
}

void main() {
  // Aspect-correct, screen-centered coordinates (matches plasma/nebula).
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
  float centerDist = length(uv);

  // Rotate into flow space: ribbons run along q.x, stack along q.y.
  float cs = cos(uAngle);
  float sn = sin(uAngle);
  vec2 q = mat2(cs, -sn, sn, cs) * uv;

  float t = uTime * uSpeed;

  // Base: soft two-stop gradient across the stacking axis, with a slow
  // breathing tilt so the field is alive even at uRibbons = 0 edge cases.
  float g = clamp(q.y * 0.85 + 0.5 + 0.04 * sin(t * 0.17), 0.0, 1.0);
  vec3 color = mix(uColorLow, uColorHigh, g);

  float ribbons = clamp(uRibbons, 0.0, float(MAX_RIBBONS));
  float calm = 1.0 - uCalm * (1.0 - smoothstep(0.15, 0.62, centerDist));

  for (int i = 0; i < MAX_RIBBONS; i++) {
    float fi = float(i);
    if (fi >= ribbons) break;

    // Stack centers across the frame, each with its own slow vertical sway.
    float center = -0.42 + 0.84 * (fi + 0.5) / ribbons + 0.07 * sin(t * 0.19 + fi * 1.7);
    // Lateral warp: low-frequency noise plus one sine, per-ribbon phase and
    // rate so the bands never move in lockstep.
    float warp = (vnoise(q.x * 1.4 + t * (0.1 + 0.04 * fi), fi * 17.0) - 0.5) * 0.5
        + 0.1 * sin(q.x * 2.3 + t * (0.26 + 0.06 * fi) + fi * 2.1);
    float dy = abs(q.y - (center + warp));

    float widthR = mix(0.06, 0.15, hash11(fi * 7.3 + 1.0));
    float soft = mix(0.008, widthR * 1.6, uSoftness);
    float band = (1.0 - smoothstep(widthR - soft, widthR + soft, dy)) * calm;

    // Ribbon shade: deeper tints at the back of the stack.
    vec3 rc = mix(uRibbonColor, uColorHigh, fi / float(MAX_RIBBONS) * 0.6);

    // uStyle blends two composites of the same band: flat paint-over vs
    // additive glow.
    vec3 flat_ = mix(color, rc, band * 0.85);
    vec3 glow = color + rc * band * 0.4;
    color = mix(flat_, glow, uStyle);
  }

  // Opaque procedural background; the person is composited over it downstream.
  oColor = vec4(color, 1.0);
}
