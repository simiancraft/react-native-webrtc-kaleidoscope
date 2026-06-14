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
// Cross-target correctness: the floor's depth is num / (dy + 0.05) where dy is the
// centered distance below the horizon. The ADDITIVE offset caps the depth at the
// horizon (no Inf/NaN, bounded line frequency); big cells in the near field keep
// the line spacing above a pixel, so the grid neither sheets nor shimmers. The
// floor is shaded only BELOW the horizon. Line width is depth-scaled (verticals
// ~linear, rungs ~depth^2) so far lines fill the cell instead of going sub-pixel.
// 1 - smoothstep(0, sz, .), NOT fwidth and NOT the reversed-edge smoothstep (which
// is undefined on GLSL ES / Metal). No variable-exponent pow, no gl_FragCoord.
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
    // --- FLOOR --- perspective grid, a faithful port of a known-good community
    // outrun grid (prior versions read as a too-dense, flickering sheet). Work in
    // the reference's centered frame: cx is full-width centered x, dy is the
    // centered distance BELOW the horizon. The additive offset caps the depth at
    // the horizon, and putting big cells in the near field (low min depth) is what
    // keeps the line spacing above a pixel, so it neither sheets nor shimmers.
    float cx = 2.0 * fx;            // = (2*vUv.x - 1) * aspect
    float dy = 2.0 * (h - fy);      // centered distance below the horizon (> 0)

    // Cell count: uGridDensity 4 -> numerator 1.0 (sparse, big near cells). x
    // widens with depth (the 0.7 factor); scroll is a slow drift toward the viewer.
    float num = uGridDensity * 0.25;
    float depth = num / (dy + 0.05);
    vec2 g = vec2(cx * depth * 0.7, depth);
    g.y += uTime * uSpeed * 0.3;
    vec2 e = abs(fract(g) - 0.5);

    // PIXEL-CALIBRATED line width: each line core is a fixed ~px wide in SCREEN
    // PIXELS (via uResolution), the same at every depth and every resolution. The
    // old depth^2*const width was constant in theory but landed sub-pixel, so
    // discrete sampling rendered some rungs thick and others thin -> the uneven
    // rungs that read as flicker. Solving sz so screen thickness == px: the rungs
    // (g.y, compression ~depth^2/num) need sz.y = depth^2 * pf / num; the verticals
    // (g.x) need sz.x = depth * 0.7 * pf. uGridGlow sets px (0.5 -> 2 px).
    float pf = (uGridGlow * 4.0) / uResolution.y;
    vec2 sz = vec2(depth * 0.7 * pf, depth * depth * pf / num);
    vec2 lines = 1.0 - smoothstep(vec2(0.0), sz, e);
    lines += (1.0 - smoothstep(vec2(0.0), sz * 4.0, e)) * 0.5;
    float gridVal = clamp(lines.x + lines.y, 0.0, 1.0);

    vec3 floorBase = uSkyHorizon * 0.06;
    col = mix(floorBase, uGridColor, gridVal * calm);
  }

  // Glowing horizon seam where floor meets sky.
  float seam = exp(-abs(fy - h) * 90.0);
  col += uGridColor * seam * 0.5 * calm;

  oColor = vec4(col, 1.0);
}
