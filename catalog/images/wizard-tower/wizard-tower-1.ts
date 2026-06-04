import type { ImageSource } from '../image.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the image id; no WebP import, no expo-asset on native.
// Web is handled by wizard-tower-1.web.ts.
export const wizardTower1: ImageSource = 'wizard-tower-1';
