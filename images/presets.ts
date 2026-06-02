// Bundled image-plate catalog. Single source of truth for the WebP plates the
// library ships under images/<name>/. Each name is the plate id an `image` layer
// uses as its `source` on native (the bundled WebP basename); on web the same
// name resolves to the WebP URL. Consumed by:
//   - src/index.ts and src/index.web.ts, which re-export the BackgroundPresetName
//     type so a consumer's image-layer `source` autocompletes to a bundled plate
//     (a free-form string is also accepted on web for consumer-provided URLs),
//   - the per-plate loader pairs (images/<name>/<name>.ts and .web.ts), which
//     annotate their export against PresetSource.
//
// The native side does NOT mirror this list at registration time: there is one
// registered effect, `composite`, and plates are data. At `expo prebuild` the
// config plugin reads the consumer's preset book, finds the image layers it
// references, and copies just those WebPs into the native bundle under
// assets/images/<id>.webp.
//
// To add a plate: append the name here, create images/<name>/ with the optimized
// <name>.webp plus the <name>.ts / <name>.web.ts loader pair, and add the
// ./images/<name> and ./images/<name>.webp package exports. No native change is
// needed; see images/README.md.

export const BACKGROUND_PRESETS = [
  'debug-resolutions',
  'dark-office',
  'light-office',
  'home-light',
  'home-dark',
  'nature-light',
  'nature-dark',
  'stylized-light',
  'stylized-dark',
  'simiancraft-light',
  'simiancraft-dark',
] as const;

export type BackgroundPresetName = (typeof BACKGROUND_PRESETS)[number];
