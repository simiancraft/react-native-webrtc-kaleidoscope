// Deep space: the procedural nebula as a full-frame backdrop, you composited
// over it. Fully procedural; no image layer.
//
// A packaged composite consumers can list by importing this module.

import { Asset } from 'expo-asset';
import type { Composite } from '../../src/kaleidoscope/types';
import nebulaThumb from './nebula.thumb.webp';

export const nebula = {
  name: 'Nebula',
  category: 'Worlds',
  thumbnail: Asset.fromModule(nebulaThumb).uri,
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
} as const satisfies Composite;
