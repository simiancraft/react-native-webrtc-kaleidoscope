// Simianlights: the nebula's calmer sibling (sparser, larger glowing orbs) as a
// standalone space backdrop, you composited over it. Fully procedural; no image
// layer.
//
// A packaged composite consumers can list by importing this module.

import { Asset } from 'expo-asset';
import type { Composite } from '../../src/kaleidoscope/types';
import simianlightsThumb from './simianlights.thumb.webp';

export const simianlights = {
  name: 'Simianlights',
  category: 'Worlds',
  thumbnail: Asset.fromModule(simianlightsThumb).uri,
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
} as const satisfies Composite;
