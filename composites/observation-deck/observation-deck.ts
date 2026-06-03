// Space observation deck: a simianlights field seen through the deck's panoramic
// window (a cut-out plate), you standing in the room, an anamorphic lens flare
// across the glass. Back-to-front: simianlights, deck plate, you, flare. The
// full "space scene".
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<name>` instead.

// Native variant. The thumbnail is the string id the prebuild plugin bundles
// `observation-deck.thumb.webp` as into the native app target;
// `resolveBackgroundUri` looks it up in Bundle.main. The `-thumb` suffix
// disambiguates from the image plate of the same composite id. The web sibling
// (observation-deck.web.ts) keeps the `Asset.fromModule(...).uri` pattern;
// mirrors images/<id>/{<id>.ts,<id>.web.ts}.
import { observationDeck as observationDeckPlate } from '../../images/observation-deck/observation-deck';
import type { Composite } from '../../src/kaleidoscope/types';

export const observationDeck = {
  name: 'Observation Deck',
  taxonomy: ['Worlds'],
  thumbnail: 'observation-deck-thumb',
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
