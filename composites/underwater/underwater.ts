// Underwater: the underwater plate with animated god rays additively on top, the
// ray tint color-matched to the scene's cool light, the masked person on top.
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<name>` instead.

import { stylizedDark } from '../../images/stylized-dark/stylized-dark';
import type { Composite } from '../../src/kaleidoscope/types';

export const underwater = {
  name: 'Underwater',
  category: 'Worlds',
  layers: [
    { id: 'stylized-dark', shader: 'image', source: stylizedDark },
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
