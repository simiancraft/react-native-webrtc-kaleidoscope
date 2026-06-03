import type { PresetSource } from '../preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the preset name; no WebP import, no expo-asset on native.
// Web is handled by wizard-tower-night.web.ts. This is the night variant of the
// wizard-tower chamber plate (the sky cut out behind the columns).
export const wizardTowerNight: PresetSource = 'wizard-tower-night';
