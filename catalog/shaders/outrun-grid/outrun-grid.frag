// Outrun grid: a scrolling neon perspective grid receding to a horizon, with a
// banded retrowave sun resting on it and a glowing horizon seam. The classic
// synthwave/outrun backdrop. An opaque BACKGROUND layer (issue #70); the masked
// subject composites over it downstream.
//
// Overdrive surface: the three color pairs are the big levers and define the
// whole mood. uGridColor is the neon line tint; uSunTop/uSunBottom grade the
// sun; uSkyHorizon/uSkyTop set the sky hue. Structural dials (uGridDensity,
// uSpeed, uSunSize, uSunBands, uHorizon) set composition and motion. uCalm eases
// the additive glow near frame center, where the masked subject's face sits.
//
// Cost: NO raymarch, NO fbm, NO loops. One guarded perspective divide, a few
// sin/exp/smoothstep. Plasma bracket; well under the clouds/nebula tier.
//
// UV convention: matches passthrough.vert. vUv = (0, 0) bottom-left, (1, 1)
// top-right. fragCoord-free; reads vUv directly. Fully procedural: no input
// texture, so ZERO net texture flips on every runtime (web/Android/Metal alike).
//
// Cross-target correctness: the floor's depth is 1 / (uHorizon - y), which would
// blow to Inf/NaN exactly at the horizon and diverges between desktop highp and
// mobile mediump. The denominator is clamped (max(..., 1.5e-3)) and the floor is
// shaded only BELOW the horizon. Distance fog (not fwidth) hides line compression
// near the vanishing line, so there is no derivative-precision question on the
// Android/Metal targets. No variable-exponent pow, no gl_FragCoord, no arrays.
//
// Precision: highp float throughout; the depth divide and grid coordinate need
// the range and the front-to-horizon dynamic range.

#version 300 es
precision highp float;

uniform float uTime;        // seconds, monotonically increasing; range [0, inf)
uniform vec2 uResolution;   // framebuffer size in pixels; both components > 0
uniform vec3 uSkyTop;       // sky gradient color at the top of frame
uniform vec3 uSkyHorizon;   // sky gradient color at the horizon
uniform vec3 uSunTop;       // sun gradient color at its top
uniform vec3 uSunBottom;    // sun gradient color at its bottom
uniform vec3 uGridColor;    // neon grid line tint (also the horizon seam)
uniform float uGridDensity; // grid cells across the floor; higher = finer
uniform float uGridGlow;    // line glow width/softness, 0..1
uniform float uSpeed;       // grid scroll rate toward the viewer; 0 freezes
uniform float uSunSize;     // sun radius in vUv.y units
uniform float uSunBands;    // horizontal slit count cut into the sun's lower half
uniform float uHorizon;     // horizon height in vUv.y, 0..1 (floor below, sky above)
uniform float uCalm;        // 0..1 eases the additive glow at frame center (face zone)

in highp vec2 vUv;
out vec4 oColor;

void main() {
  float aspect = uResolution.x / uResolution.y;
  float fx = (vUv.x - 0.5) * aspect; // aspect-correct, screen-centered x
  float fy = vUv.y;                  // 0 bottom .. 1 top
  float h = clamp(uHorizon, 0.05, 0.95);

  // Ease additive glow near the frame center (the subject's face sits there).
  float calm = 1.0 - uCalm * (1.0 - smoothstep(0.18, 0.62, length(vec2(fx, fy - 0.5))));

  vec3 col;

  if (fy > h) {
    // --- SKY ---
    float skyT = (fy - h) / (1.0 - h); // 0 at horizon, 1 at the top of frame
    col = mix(uSkyHorizon, uSkyTop, skyT);

    // --- SUN --- centered just above the horizon so its lower arc sinks below
    // it and is occluded by the floor (the half-set sun, for free).
    float sunCY = h + uSunSize * 0.55;
    vec2 sd = vec2(fx, fy - sunCY);
    float r = length(sd) / max(uSunSize, 1e-3); // normalized radius, 1 at the edge

    // Soft glow halo bleeding into the sky around the disc.
    float halo = exp(-max(r - 1.0, 0.0) * 5.5);
    col += uSunTop * halo * 0.55 * calm;

    // Sun body: vertical gradient, with horizontal bands cut from the lower half
    // (each gap thickening toward the bottom, the iconic retrowave slit pattern).
    float disc = smoothstep(1.0, 0.985, r);
    float vy = clamp(sd.y / max(uSunSize, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
    vec3 sunCol = mix(uSunBottom, uSunTop, vy);

    float below = max(-sd.y / max(uSunSize, 1e-3), 0.0); // 0 above center, grows downward
    float slit = fract(below * uSunBands);
    float gapW = clamp(below, 0.0, 1.0) * 0.85;          // gap fraction grows downward
    float cut = step(slit, gapW) * smoothstep(0.04, 0.12, below); // keep upper sun whole
    float sunBody = disc * (1.0 - cut);

    col = mix(col, sunCol, sunBody);
  } else {
    // --- FLOOR --- perspective grid. Guard the divide; shade only below horizon.
    float depth = 1.0 / max(h - fy, 1.5e-3); // large near the horizon
    float depthMin = 1.0 / h;                // depth at the very front (fy = 0)
    vec2 fuv = vec2(fx * depth, depth + uTime * uSpeed);

    // Distance to the nearest grid line in each axis (0 on a line, 0.5 mid-cell).
    vec2 f = fract(fuv * uGridDensity);
    vec2 lineDist = min(f, 1.0 - f);
    float d = min(lineDist.x, lineDist.y);

    // Analytic neon glow; uGridGlow widens/softens the line.
    float line = exp(-d * d * (220.0 / max(uGridGlow, 0.05)));

    // Distance fog: fade lines out before the horizon-compression aliasing zone,
    // which also gives the authentic converging-to-fog look.
    float fog = clamp(1.0 - (depth - depthMin) / (depthMin * 14.0), 0.0, 1.0);
    fog *= fog;

    vec3 floorBase = mix(vec3(0.0), uSkyHorizon * 0.16, fog * 0.6);
    col = floorBase + uGridColor * line * fog * calm;
  }

  // Glowing horizon seam where floor meets sky.
  float seam = exp(-abs(fy - h) * 90.0);
  col += uGridColor * seam * 0.5 * calm;

  oColor = vec4(col, 1.0);
}
