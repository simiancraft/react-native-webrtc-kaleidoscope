// Simianlights: the nebula's calmer sibling (sparser, larger glowing orbs) as a
// standalone space backdrop, you composited over it. Fully procedural; no image
// layer.
//
// A packaged composite consumers can list by importing this module.

// Native variant. The thumbnail is the string id the prebuild plugin bundles
// `simianlights.thumb.webp` as into the native app target;
// `resolveThumbnailUri` looks it up in Bundle.main. The web sibling
// (simianlights.web.ts) keeps the `Asset.fromModule(...).uri` pattern;
// mirrors images/<id>/{<id>.ts,<id>.web.ts}.
import type { KaleidoscopePreset } from '../../../src/kaleidoscope.preset-book.types';

export const simianlights = {
  name: 'Simianlights',
  taxonomy: ['Shaders', 'Simianlights'],
  thumbnail: 'simianlights-thumb',
  layers: [
    {
      id: 'field',
      shader: 'simianlights',
      uniforms: {
        uColor: [0.8, 0.56, 0.42],
        uBrightness: 0.42,
        uSpeed: 3,
        uTwinkleSpeed: 3,
        uScale: 0.98,
        uStarGlow: 0.87,
      },
    },
    // You, drifting in the field.
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies KaleidoscopePreset;
