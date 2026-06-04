import type { ImageSource } from '../image.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the image id; no WebP import, no expo-asset on native.
// Web is handled by wizard-tower-night.web.ts.
export const wizardTowerNight: ImageSource = 'wizard-tower-night';
