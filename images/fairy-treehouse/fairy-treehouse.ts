import type { PresetSource } from '../preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the preset name; no WebP import, no expo-asset on native.
// Web is handled by fairy-treehouse.web.ts. This is the fairy-cave scene's cave
// plate (the round opening cut out so the night sky shows through behind it).
export const fairyTreehouse: PresetSource = 'fairy-treehouse';
