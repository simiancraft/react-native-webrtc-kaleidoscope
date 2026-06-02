import type { PresetSource } from '../preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the preset name; no WebP import, no expo-asset on native.
// Web is handled by wizards-tower.web.ts. This is the wizard-tower scene's
// cut-out tower plate (the chamber, with the sky cut out behind it).
export const wizardsTower: PresetSource = 'wizards-tower';
