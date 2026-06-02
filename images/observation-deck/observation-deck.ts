import type { PresetSource } from '../preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the preset name; no WebP import, no expo-asset on native.
// Web is handled by observation-deck.web.ts. This is the observation-deck
// scene's interior plate (the deck room, panoramic window cut out behind it).
export const observationDeck: PresetSource = 'observation-deck';
