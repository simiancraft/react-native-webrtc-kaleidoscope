// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is observation-deck.ts (no thumbnail).
// Mirrors images/<id>/{<id>.ts,<id>.web.ts}.

import { Asset } from 'expo-asset';
import { observationDeck as observationDeckPlate } from '../../images/observation-deck/observation-deck';
import type { Composite } from '../../src/kaleidoscope/types';
import observationDeckThumb from './observation-deck.thumb.webp';

export const observationDeck = {
  name: 'Observation Deck',
  taxonomy: ['Worlds'],
  thumbnail: Asset.fromModule(observationDeckThumb).uri,
  layers: [
    {
      id: 'field',
      shader: 'simianlights',
      uniforms: {
        uColor: [0.27, 0.44, 0.17],
        uBrightness: 1.7,
        uSpeed: 2.66,
        uTwinkleSpeed: 0.36,
        uScale: 2.85,
        uStarGlow: 1.56,
      },
    },
    // The deck interior; the window is cut out so the field shows through.
    { id: 'observation-deck', shader: 'image', source: observationDeckPlate },
    // You, standing at the window.
    { id: 'you', shader: 'direct', target: 'subject' },
    // Lens flare across the glass, on top of everything. Magenta/pink tint
    // against the green field, ghosts cranked up. Additive.
    {
      id: 'flare',
      shader: 'anamorphic-lensflare',
      blend: 'additive',
      uniforms: {
        uFlareX: 0.33,
        uFlareY: 0.64,
        uIntensity: 0.44,
        uStreakLength: 0.41,
        uStreakWidth: 165,
        uGhostStrength: 1.5,
        uWarmColor: [0.88, 0.28, 0.52],
        uBlueColor: [0.96, 0.37, 0.81],
        uPinkColor: [0.91, 0.14, 0.63],
      },
    },
  ],
} as const satisfies Composite;
