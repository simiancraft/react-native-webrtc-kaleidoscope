# clouds.frag presets

Working values for `shaders/clouds.frag`, kept here so we don't fish through the
shader comments. Each row becomes a time-of-day preset-book entry when clouds is
wired into the generic shader channel (a set of uniform values over one shader).

## Time-of-day palettes

Four colors + exposure. `uSkyLowColor` = horizon, `uSkyHighColor` = overhead,
`uCloudLightColor` = lit/upper cloud, `uCloudDarkColor` = shadowed/lower cloud,
`uExposure` = overall brightness.

| preset         | uSkyLowColor     | uSkyHighColor    | uCloudLightColor | uCloudDarkColor  | uExposure |
|----------------|------------------|------------------|------------------|------------------|-----------|
| deep-night ★   | 0.02, 0.03, 0.08 | 0.10, 0.14, 0.28 | 0.38, 0.42, 0.55 | 0.08, 0.10, 0.16 | 0.75      |
| bright-day     | 0.48, 0.68, 0.95 | 0.85, 0.93, 1.00 | 1.00, 0.97, 0.90 | 0.62, 0.67, 0.76 | 1.0       |
| sunset         | 0.95, 0.38, 0.18 | 0.35, 0.18, 0.55 | 1.00, 0.62, 0.35 | 0.35, 0.16, 0.28 | 0.9       |

★ = current default baked into the shader.

## Shape looks

Vary `STEP_SIZE` + `CLOUD_SPEED`:

| look    | STEP_SIZE | CLOUD_SPEED | feel               |
|---------|-----------|-------------|--------------------|
| clear   | 0.20      | 0.6         | clearer, separated |
| billowy | 0.10      | 0.2         | fatter, billowy    |
| wispy   | 0.25      | 0.2         | wispier, slower    |

Shared shape knobs: `STEPS` 64, `CLOUD_SCALE` 0.65, `DENSITY` 0.07,
`COVERAGE` 0.44, `SOFTNESS` 0.15.

## Transparency / layer use

- `TRANSPARENT_BACKGROUND 0` → opaque sky + clouds: a full **background** layer.
- `TRANSPARENT_BACKGROUND 1` → clouds only, **premultiplied alpha**: a transparent
  **overlay** layer. The compositor must blend it premultiplied (`dst*(1-a) + rgb`)
  and must NOT re-apply gamma — the shader already skips the gamma lift on this
  path, which is correct for a premultiplied, to-be-composited buffer.

## Integration TODO (when wired into the channel)

- Globals `uSky*` / `uCloud*` / `uExposure` → real uniforms (decls already in the
  shader header comment).
- `iTime` / `iResolution` / `mainImage` → `uTime` / `uResolution` / `main` + `oColor`.
- Lift shape knobs to uniforms (`STEP_SIZE`, `CLOUD_SPEED`, `CLOUD_SCALE`,
  `DENSITY`, `COVERAGE`, `SOFTNESS`); keep `STEPS` a compile-time constant.
- Palettes above become book entries (e.g. `clouds-deep-night`, `clouds-day`,
  `clouds-sunset`).
