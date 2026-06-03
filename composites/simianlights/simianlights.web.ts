// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is simianlights.ts (no thumbnail).
// Mirrors images/<id>/{<id>.ts,<id>.web.ts}.

import { Asset } from 'expo-asset';
import type { Composite } from '../../src/kaleidoscope/types';
import simianlightsThumb from './simianlights.thumb.webp';

export const simianlights = {
  name: 'Simianlights',
  taxonomy: ['Worlds'],
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
