import type { PresetSource } from './preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the preset name; no WebP import, no expo-asset on native.
// Web is handled by dark-office.web.ts.
export const darkOffice: PresetSource = 'dark-office';
