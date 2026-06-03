import type { PresetSource } from '../preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the plate id; no WebP import, no expo-asset on native.
// Web is handled by debug-resolutions.web.ts.
export const debugResolutions: PresetSource = 'debug-resolutions';
