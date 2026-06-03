// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is fairy-grotto.ts (no thumbnail).

import { Asset } from 'expo-asset';
import { grotto } from '../../images/fairy-caves/grotto';
import type { Composite } from '../../src/kaleidoscope/types';
import fairyGrottoThumb from './fairy-grotto.thumb.webp';

export const fairyGrotto = {
  name: 'Grotto',
  taxonomy: ['Worlds', 'Fairy Cave'],
  thumbnail: Asset.fromModule(fairyGrottoThumb).uri,
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
} as const satisfies Composite;
