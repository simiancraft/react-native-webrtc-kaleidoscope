// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is fairy-cave.ts (no thumbnail). Mirrors images/<id>/{<id>.ts,<id>.web.ts}.

import { Asset } from 'expo-asset';
import { fairyTreehouse } from '../../images/fairy-treehouse/fairy-treehouse';
import type { Composite } from '../../src/kaleidoscope/types';
import fairyCaveThumb from './fairy-cave.thumb.webp';

export const fairyCave = {
  name: 'Fairy Cave',
  taxonomy: ['Worlds', 'Fairy Cave'],
  thumbnail: Asset.fromModule(fairyCaveThumb).uri,
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
    { id: 'fairy-treehouse', shader: 'image', source: fairyTreehouse },
    {
      id: 'fireflies',
      shader: 'fireflies',
      blend: 'additive',
      uniforms: { uGlowSize: 0.025, uDotSize: 0.004, uSpeed: 0.18, uTwinkle: 1.6 },
    },
    // You, in the cave (fireflies drifting behind you).
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies Composite;
