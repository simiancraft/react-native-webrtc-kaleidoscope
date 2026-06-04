// Underwater: the underwater plate with animated god rays additively on top, the
// ray tint color-matched to the scene's cool light, the masked person on top.
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<category>/<leaf>` instead.

import type { KaleidoscopePreset } from '../../../src/kaleidoscope.preset-book.types';
// Native variant. The thumbnail is the string id the prebuild plugin bundles
// `underwater.thumb.webp` as into the native app target;
// `resolveThumbnailUri` looks it up in Bundle.main. The web sibling
// (underwater.web.ts) keeps the `Asset.fromModule(...).uri` pattern;
// mirrors images/<id>/{<id>.ts,<id>.web.ts}.
import { oceanscapeDark } from '../../images/underwater/oceanscape-dark';

export const underwater = {
  name: 'Underwater',
  taxonomy: ['Worlds', 'Ocean'],
  thumbnail: 'underwater-thumb',
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
} as const satisfies KaleidoscopePreset;
