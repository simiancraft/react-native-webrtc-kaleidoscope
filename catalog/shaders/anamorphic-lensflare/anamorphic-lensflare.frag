// Animated cinematic anamorphic lens flare. A transparent OVERLAY layer (use
// blend 'additive'); intended to sit in front of the layers beneath as a camera-lens
// artifact (the observation-deck composite runs it over the simianlights field
// plus the deck image).
//
// Ported from a ShaderToy prototype (mainImage/iTime/iResolution) to this repo's
// GLSL ES 3.00 multi-runtime convention. The #define knobs and the three palette
// consts are now uniforms so composites can place the flare and color-match it to
// whatever sits behind it.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) at bottom-left, (1, 1)
// at top-right; ShaderToy's fragCoord / iResolution shares that origin, so uv =
// vUv directly with no flip. Fully procedural: no input texture, so there is no
// texture-origin handoff. Net texture flips: zero on every runtime.

#version 300 es
precision highp float;

uniform float uTime;          // seconds, monotonically increasing; range [0, inf)
uniform float uFlareX;        // flare X position, 0..1 (drifts slowly around this)
uniform float uFlareY;        // flare Y position, 0..1 (0 = bottom)
uniform float uIntensity;     // overall brightness multiplier
uniform float uStreakLength;  // horizontal streak reach; higher = longer
uniform float uStreakWidth;   // main streak vertical tightness; higher = thinner
uniform float uGhostStrength; // optical-ghost strength along the flare axis
uniform vec3 uWarmColor;      // core / warm streak tint
uniform vec3 uBlueColor;      // halo / wide-streak tint
uniform vec3 uPinkColor;      // secondary streak / ghost tint

in highp vec2 vUv;
out vec4 oColor;

float softOrb(vec2 uv, vec2 center, float radius) {
  float d = length(uv - center);
  float q = d / radius;  // pow(q, 2.0) -> q*q; spirv-opt does not strength-reduce it
  return exp(-q * q);
}

float softStreak(vec2 uv, vec2 center, float width, float length) {
  float yFalloff = exp(-abs(uv.y - center.y) * width);
  float xFalloff = exp(-abs(uv.x - center.x) * length);
  return yFalloff * xFalloff;
}

void main() {
  // ShaderToy uv = fragCoord / iResolution; identical to vUv here.
  vec2 uv = vUv;

  // Slow horizontal drift.
  float horizontalDrift = sin(uTime * 0.18) * 0.10;
  vec2 flarePos = vec2(uFlareX + horizontalDrift, uFlareY);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // Main source.
  float core = softOrb(uv, flarePos, 0.022);
  float bloom = softOrb(uv, flarePos, 0.095);
  float outerHalo = softOrb(uv, flarePos, 0.28);

  col += vec3(1.0) * core * 1.8;
  col += uWarmColor * bloom * 0.95;
  col += uBlueColor * outerHalo * 0.16;

  alpha += core * 0.45;
  alpha += bloom * 0.22;
  alpha += outerHalo * 0.045;

  // Moving streak intensity.
  float sweepGlow = 0.85 + 0.15 * sin(uTime * 0.7 + uv.x * 8.0);

  // Main + wide anamorphic streaks.
  float mainStreak = softStreak(uv, flarePos, uStreakWidth, uStreakLength);
  float wideStreak = softStreak(uv, flarePos, 70.0, uStreakLength * 0.65);

  col += uWarmColor * mainStreak * 1.15 * sweepGlow;
  col += uBlueColor * wideStreak * 0.26 * sweepGlow;

  alpha += mainStreak * 0.18;
  alpha += wideStreak * 0.055;

  // Secondary colored streaks.
  float upperLine = softStreak(uv, flarePos + vec2(0.0, 0.012), 260.0, uStreakLength * 0.7);
  float lowerLine = softStreak(uv, flarePos - vec2(0.0, 0.010), 240.0, uStreakLength * 0.8);

  col += uBlueColor * upperLine * 0.22;
  col += uPinkColor * lowerLine * 0.16;

  alpha += (upperLine + lowerLine) * 0.035;

  // Optical ghosts along the line from the flare through screen center.
  vec2 center = vec2(0.5);
  vec2 axis = center - flarePos;

  vec2 ghost1 = flarePos + axis * 0.45;
  vec2 ghost2 = flarePos + axis * 0.85;
  vec2 ghost3 = flarePos + axis * 1.28;
  vec2 ghost4 = flarePos - axis * 0.35;

  float g1 = softOrb(uv, ghost1, 0.070);
  float g2 = softOrb(uv, ghost2, 0.115);
  float g3 = softOrb(uv, ghost3, 0.055);
  float g4 = softOrb(uv, ghost4, 0.095);

  col += uPinkColor * g1 * 0.18 * uGhostStrength;
  col += uBlueColor * g2 * 0.15 * uGhostStrength;
  col += uWarmColor * g3 * 0.22 * uGhostStrength;
  col += uBlueColor * g4 * 0.10 * uGhostStrength;

  alpha += g1 * 0.040 * uGhostStrength;
  alpha += g2 * 0.035 * uGhostStrength;
  alpha += g3 * 0.050 * uGhostStrength;
  alpha += g4 * 0.030 * uGhostStrength;

  // Tiny shimmer to keep it alive.
  float shimmer = 0.97 + 0.03 * sin(uTime * 2.1);

  col *= uIntensity * shimmer;
  alpha *= uIntensity * shimmer;

  alpha = clamp(alpha, 0.0, 1.0);
  oColor = vec4(col, alpha);
}
