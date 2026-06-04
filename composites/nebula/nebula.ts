// Deep space: the procedural nebula as a full-frame backdrop, you composited
// over it. Fully procedural; no image layer.
//
// A packaged composite consumers can list by importing this module.
//
// Native variant. The thumbnail is the string id the prebuild plugin
// (app.plugin.js) bundles `nebula.thumb.webp` as into the native app target;
// `resolveBackgroundUri` looks it up by that id in Bundle.main. Metro's
// require()-based asset path is not used here because the symlinked-library
// bundling registers only the first few thumb webps in the asset registry
// (the rest get module ids that `Image.resolveAssetSource` cannot resolve).
// The web sibling (nebula.web.ts) keeps the `Asset.fromModule(...).uri`
// pattern; mirrors images/<id>/{<id>.ts,<id>.web.ts}.

import type { KaleidoscopePreset } from '../../src/kaleidoscope.preset-book.types';

export const nebula = {
  name: 'Nebula',
  taxonomy: ['Shaders', 'Nebula'],
  thumbnail: 'nebula-thumb',
  layers: [
    {
      id: 'nebula',
      shader: 'nebula',
      uniforms: {
        uColor: [0.53, 0.55, 0.84],
        uBrightness: 0.87,
        uSpeed: 0.22,
        uTwinkleSpeed: 1.94,
        uScale: 0.88,
        uStarGlow: 0.38,
      },
    },
    // You, drifting in the field.
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies KaleidoscopePreset;
