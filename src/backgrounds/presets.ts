// Background-image preset catalog. Single source of truth for the bundled
// presets the library ships. Consumed by:
//   - src/types.ts (BackgroundImageSpec.source narrows to BackgroundPresetName
//     for autocomplete; a free-form string is also accepted on web for
//     consumer-provided URLs),
//   - src/index.ts (native allowlist derivation; the flat-string upstream
//     registry encodes each preset as `background-image-${name}`),
//   - the Android side mirrors this list at android/.../Registration.kt
//     and android/src/main/assets/backgrounds/<name>.webp.
//   - the iOS side mirrors it at ios/.../Registration.swift and
//     ios/KaleidoscopeModule/resources/backgrounds/<name>.webp.
//   - the demo at demo/app/index.tsx maps each preset name to a bundled
//     WebP via Asset.fromModule for the web target.
//
// To add a new preset: append the name here, drop the matching
// <name>.webp into android/src/main/assets/backgrounds/ and
// ios/KaleidoscopeModule/resources/backgrounds/, add the require()'d
// asset to the demo's preset map, and register the factory at both
// Registration.kt and Registration.swift. The web side picks it up
// automatically via the literal-union type and the derived native allowlist.

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
