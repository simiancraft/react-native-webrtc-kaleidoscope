import type { PresetSource } from '../preset-source.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the preset name. Web is handled by
// debug-resolutions.web.ts. This is a viewport/resolution calibration grid for
// verifying background cover-fit (clipping, crop, scale) on device.
export const debugResolutions: PresetSource = 'debug-resolutions';
