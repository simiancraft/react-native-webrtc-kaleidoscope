// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is underwater.ts (no thumbnail).
// Mirrors images/<id>/{<id>.ts,<id>.web.ts}.

import { Asset } from 'expo-asset';
import { oceanscapeDark } from '../../images/underwater/oceanscape-dark';
import type { Composite } from '../../src/kaleidoscope/types';
import underwaterThumb from './underwater.thumb.webp';

export const underwater = {
  name: 'Underwater',
  taxonomy: ['Worlds', 'Ocean'],
  thumbnail: Asset.fromModule(underwaterThumb).uri,
  layers: [
    { id: 'oceanscape-dark', shader: 'image', source: oceanscapeDark },
    {
      id: 'rays',
      shader: 'godrays',
      blend: 'additive',
      uniforms: {
        uLightColor: [1, 1, 1],
        uRayCount: 11,
        uRaySpeed: 0.55,
        uRayIntensity: 1.2,
        uRaySoftness: 2.6,
        uTopGlow: 0.5,
        uFadeDistance: 0.75,
        uWobbleAmount: 0.08,
        uWobbleSpeed: 0.7,
      },
    },
    // The masked camera person, on top (god rays behind them). 'direct' on the
    // subject target = a passthrough of the segmented person.
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies Composite;
