// Fairy grotto: a root-cave variant of fairy-cave. A bright sky through the round
// opening, the grotto plate, warm fire-orange fireflies drifting on top, you in
// the cave. A variation of fairy-cave with the clouds `sky` brightened and the
// fireflies color-shifted warmer to match the fire-lit alcoves.
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<category>/<leaf>` instead.

// Native variant. The thumbnail is the string id the prebuild plugin bundles
// `fairy-grotto.thumb.webp` as into the native app target; `resolveBackgroundUri`
// looks it up in Bundle.main. The web sibling keeps the `Asset.fromModule` path.
import { grotto } from '../../images/fairy-caves/grotto';
import type { KaleidoscopePreset } from '../../src/kaleidoscope/types';

export const fairyGrotto = {
  name: 'Grotto',
  taxonomy: ['Worlds', 'Fairy Cave'],
  thumbnail: 'fairy-grotto-thumb',
  layers: [
    {
      id: 'sky',
      shader: 'clouds',
      uniforms: {
        uSkyLowColor: [0.85, 0.8, 0.68],
        uSkyHighColor: [0.55, 0.68, 0.85],
        uCloudLightColor: [1.0, 0.98, 0.92],
        uCloudDarkColor: [0.65, 0.68, 0.72],
        uExposure: 1.25,
        uStepSize: 0.38,
        uCloudSpeed: 0.4,
        uCloudScale: 1.2,
        uDensity: 0.05,
        uCoverage: 0.6,
        uSoftness: 0.2,
      },
    },
    { id: 'grotto', shader: 'image', source: grotto },
    {
      id: 'fireflies',
      shader: 'fireflies',
      blend: 'additive',
      uniforms: {
        uGlowSize: 0.025,
        uDotSize: 0.004,
        uSpeed: 0.18,
        uTwinkle: 1.6,
        uColor: [1.0, 0.55, 0.2],
      },
    },
    // You, in the cave (fireflies drifting behind you).
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies KaleidoscopePreset;
