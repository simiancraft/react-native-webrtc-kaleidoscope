// Fairy cave: a moonlit night sky through the round opening, the cave plate, and
// fireflies drifting on top, you in the cave.
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<category>/<leaf>` instead.

import type { KaleidoscopePreset } from '../../../src/kaleidoscope.preset-book.types';
// Native variant. The thumbnail is the string id the prebuild plugin bundles
// `fairy-cave.thumb.webp` as into the native app target; `resolveImageUri`
// looks it up in Bundle.main. The web sibling (fairy-cave.web.ts) keeps the
// `Asset.fromModule(...).uri` pattern; mirrors images/<id>/{<id>.ts,<id>.web.ts}.
import { treehouse } from '../../images/fairy-caves/treehouse';

export const fairyCave = {
  name: 'Fairy Cave',
  taxonomy: ['Worlds', 'Fairy Cave'],
  thumbnail: 'fairy-cave-thumb',
  layers: [
    {
      id: 'sky',
      shader: 'clouds',
      uniforms: {
        uSkyLowColor: [0.05, 0.01, 0.04],
        uSkyHighColor: [0.02, 0.02, 0.04],
        uCloudLightColor: [0.72, 0.39, 0.1],
        uCloudDarkColor: [0.18, 0.14, 0.07],
        uExposure: 0.93,
        uStepSize: 0.38,
        uCloudSpeed: 0.37,
        uCloudScale: 1.26,
        uDensity: 0.035,
        uCoverage: 0.44,
        uSoftness: 0.18,
      },
    },
    { id: 'treehouse', shader: 'image', source: treehouse },
    {
      id: 'fireflies',
      shader: 'fireflies',
      blend: 'additive',
      uniforms: {
        uGlowSize: 0.025,
        uDotSize: 0.004,
        uSpeed: 0.18,
        uTwinkle: 1.6,
        uColor: [1.0, 0.82, 0.32],
      },
    },
    // You, in the cave (fireflies drifting behind you).
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies KaleidoscopePreset;
