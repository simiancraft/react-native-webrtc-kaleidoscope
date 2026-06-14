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
// shaded only BELOW the horizon. Grid anti-aliasing is per-axis, depth-scaled line
// width (NOT fwidth, NOT reversed-edge smoothstep): each axis' line band widens at
// its own screen-space compression rate, so far lines never go sub-pixel and the
// grid does not shimmer as it scrolls. No derivative-precision question on the
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
    // Drift the slit phase over time so the sun's scanlines crawl downward.
    float slit = fract(below * uSunBands - uTime * 0.18);
    float gapW = clamp(below, 0.0, 1.0) * 0.85;          // gap fraction grows downward
    float cut = step(slit, gapW) * smoothstep(0.04, 0.12, below); // keep upper sun whole
    float sunBody = disc * (1.0 - cut);

    col = mix(col, sunCol, sunBody);
  } else {
    // --- FLOOR --- perspective grid. Guard the divide; shade only below horizon.
    float depth = 1.0 / max(h - fy, 1.5e-3); // large near the horizon
    float depthMin = 1.0 / h;                // depth at the very front (fy = 0)

    // Grid coordinates: x widens with depth (perspective); uGridDensity sets the
    // cell count; the scroll is in cell units so its rate is density-independent.
    vec2 g = vec2(fx * depth, depth) * uGridDensity;
    g.y += uTime * uSpeed * 2.0;
    vec2 cell = abs(fract(g) - 0.5); // 0 on a line .. 0.5 mid-cell, per axis

    // Per-axis, depth-scaled line half-width: the rungs (g.y) compress toward the
    // horizon as depth^2 and the verticals (g.x) ~linearly, so widening each axis'
    // line band at its own compression rate holds the on-screen line width roughly
    // constant. Far lines fuse into a band instead of a sub-pixel sheet that
    // shimmers as it scrolls; near lines stay crisp. Written 1 - smoothstep(0, w, .)
    // (NOT the reversed-edge smoothstep(w, 0, .), which is undefined on GLSL ES /
    // Metal) and derivative-free, so it is portable and mobile-precision safe.
    vec2 w = max(vec2(depth, depth * depth * 0.2) * uGridDensity * 0.0013, vec2(1e-4));
    vec2 core = 1.0 - smoothstep(vec2(0.0), w, cell);
    vec2 halo = (1.0 - smoothstep(vec2(0.0), w * 6.0, cell)) * (0.5 * uGridGlow);
    float gridVal = clamp(core.x + core.y + halo.x + halo.y, 0.0, 1.5);

    // Distance fog: fade the grid out toward the horizon for the converging look.
    float fog = clamp(1.0 - (depth - depthMin) / (depthMin * 10.0), 0.0, 1.0);
    fog *= fog;

    vec3 floorBase = mix(vec3(0.0), uSkyHorizon * 0.16, fog * 0.6);
    col = floorBase + uGridColor * gridVal * fog * calm;
  }

  // Glowing horizon seam where floor meets sky.
  float seam = exp(-abs(fy - h) * 90.0);
  col += uGridColor * seam * 0.5 * calm;

  oColor = vec4(col, 1.0);
}
