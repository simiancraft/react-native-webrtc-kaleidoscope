// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is fairy-hollow.ts (no thumbnail).

import { Asset } from 'expo-asset';
import { hollow } from '../../images/fairy-caves/hollow';
import type { KaleidoscopePreset } from '../../src/kaleidoscope.preset-book.types';
import fairyHollowThumb from './fairy-hollow.thumb.webp';

export const fairyHollow = {
  name: 'Hollow',
  taxonomy: ['Worlds', 'Fairy Cave'],
  thumbnail: Asset.fromModule(fairyHollowThumb).uri,
  layers: [
    {
      id: 'sky',
      shader: 'clouds',
      uniforms: {
        uSkyLowColor: [0.92, 0.9, 0.85],
        uSkyHighColor: [0.7, 0.8, 0.92],
        uCloudLightColor: [1.0, 1.0, 0.98],
        uCloudDarkColor: [0.78, 0.8, 0.85],
        uExposure: 1.4,
        uStepSize: 0.38,
        uCloudSpeed: 0.35,
        uCloudScale: 1.3,
        uDensity: 0.04,
        uCoverage: 0.7,
        uSoftness: 0.2,
      },
    },
    { id: 'hollow', shader: 'image', source: hollow },
    {
      id: 'fireflies',
      shader: 'fireflies',
      blend: 'additive',
      uniforms: {
        uGlowSize: 0.025,
        uDotSize: 0.004,
        uSpeed: 0.18,
        uTwinkle: 1.6,
        uColor: [0.65, 0.85, 1.0],
      },
    },
    // You, in the cave (fireflies drifting behind you).
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies KaleidoscopePreset;
