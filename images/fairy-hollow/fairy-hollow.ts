import type { PresetSource } from '../preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the preset name; no WebP import, no expo-asset on native.
// Web is handled by fairy-hollow.web.ts. This is a fairy-cave grand-portal plate
// (the large round opening cut out so the sky shows through behind it).
export const fairyHollow: PresetSource = 'fairy-hollow';
