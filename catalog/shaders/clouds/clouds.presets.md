# clouds.frag presets

Working uniform values for `clouds.frag`, kept here so we don't fish through the
shader comments. Each row is a time-of-day look (a set of uniform values over the
one shader); a composite picks one and overrides the uniforms.

## Time-of-day palettes

Four colors + exposure. `uSkyLowColor` = horizon, `uSkyHighColor` = overhead,
`uCloudLightColor` = lit/upper cloud, `uCloudDarkColor` = shadowed/lower cloud,
`uExposure` = overall brightness.

| preset         | uSkyLowColor     | uSkyHighColor    | uCloudLightColor | uCloudDarkColor  | uExposure |
|----------------|------------------|------------------|------------------|------------------|-----------|
| bright-day ★   | 0.48, 0.68, 0.95 | 0.85, 0.93, 1.00 | 1.00, 0.97, 0.90 | 0.62, 0.67, 0.76 | 1.0       |
| deep-night     | 0.02, 0.03, 0.08 | 0.10, 0.14, 0.28 | 0.38, 0.42, 0.55 | 0.08, 0.10, 0.16 | 0.75      |
| sunset         | 0.95, 0.38, 0.18 | 0.35, 0.18, 0.55 | 1.00, 0.62, 0.35 | 0.35, 0.16, 0.28 | 0.9       |

★ = the default in `CLOUDS_CONTROLS` (clouds.ts); the shader bakes no defaults.

## Shape looks

Vary `uStepSize` + `uCloudSpeed`:

| look    | uStepSize | uCloudSpeed | feel               |
|---------|-----------|-------------|--------------------|
| clear   | 0.20      | 0.6         | clearer, separated |
| billowy | 0.10      | 0.2         | fatter, billowy    |
| wispy   | 0.25      | 0.2         | wispier, slower    |

Shared shape knobs: `STEPS` 64 (compile-time constant), `uCloudScale` 0.65,
`uDensity` 0.07, `uCoverage` 0.44, `uSoftness` 0.15.

## Layer use

The shipped shader outputs an opaque sky + clouds (`alpha 1`): a full
**background** layer, composited under the masked person downstream.
