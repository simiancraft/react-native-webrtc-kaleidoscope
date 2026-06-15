// Web variant. Resolves the thumbnail URI via expo-asset at module-load time;
// safe on web (react-native-web has no Image.resolveAssetSource and `.uri` is
// set synchronously by fromModule). Native is clouds.ts (a string-id thumbnail
// the prebuild plugin bundles). Mirrors the other composites' {<id>.ts,<id>.web.ts}.

import { Asset } from 'expo-asset';
import type { KaleidoscopePreset } from '../../../src/kaleidoscope.preset-book.types';
import cloudsThumb from './clouds.thumb.webp';

export const clouds = {
  name: 'Daytime',
  taxonomy: ['Shaders', 'Sky'],
  thumbnail: Asset.fromModule(cloudsThumb).uri,
  layers: [
    {
      id: 'sky',
      shader: 'clouds',
      uniforms: {
        uSkyLowColor: [0.09, 0.63, 0.95],
        uSkyHighColor: [0.04, 0.03, 0.86],
        uCloudLightColor: [1.0, 0.91, 0.77],
        uCloudDarkColor: [0.3, 0.3, 0.5],
        uExposure: 1.27,
        uStepSize: 0.16,
        uCloudSpeed: 0.52,
        uCloudScale: 1.08,
        uDensity: 0.245,
        uCoverage: 0.47,
        uSoftness: 0.28,
      },
    },
    // You, under the sky.
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies KaleidoscopePreset;
