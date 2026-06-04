import type { PresetSource } from '../preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the plate id; no WebP import, no expo-asset on native.
// Web is handled by wizard-tower-1.web.ts.
export const wizardTower1: PresetSource = 'wizard-tower-1';
