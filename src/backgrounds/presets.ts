// Background-image preset catalog. Single source of truth for the bundled
// presets the library ships. Consumed by:
//   - src/types.ts (BackgroundImageSpec.source narrows to BackgroundPresetName
//     for autocomplete; a free-form string is also accepted on web for
//     consumer-provided URLs),
//   - src/index.ts (native allowlist derivation; the flat-string upstream
//     registry encodes each preset as `background-image-${name}`),
//   - the Android side mirrors this list at android/.../Registration.kt
//     and android/src/main/assets/backgrounds/<name>.png.
//   - the iOS side will mirror it at ios/.../Registration.swift once the
//     iOS processors land.
//   - the demo at demo/app/index.tsx maps each preset name to a bundled
//     PNG via Asset.fromModule for the web target.
//
// To add a new preset: append the name here, drop the matching
// <name>.png into android/src/main/assets/backgrounds/, add the
// require()'d asset to the demo's preset map, and register the factory
// at android/.../Registration.kt. The web side picks it up automatically
// via the literal-union type and the derived native allowlist.

export const BACKGROUND_PRESETS = ['office-1', 'office-2'] as const;

export type BackgroundPresetName = (typeof BACKGROUND_PRESETS)[number];
