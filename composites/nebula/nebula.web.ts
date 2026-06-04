// Web variant. Resolves the thumbnail URI via expo-asset at module-load time;
// safe on web (react-native-web has no Image.resolveAssetSource and `.uri` is
// set synchronously by fromModule). Native is nebula.ts (no thumbnail).
// Mirrors images/<id>/{<id>.ts,<id>.web.ts}.

import { Asset } from 'expo-asset';
import type { KaleidoscopePreset } from '../../src/kaleidoscope.preset-book.types';
import nebulaThumb from './nebula.thumb.webp';

export const nebula = {
  name: 'Nebula',
  taxonomy: ['Shaders', 'Nebula'],
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
} as const satisfies KaleidoscopePreset;
