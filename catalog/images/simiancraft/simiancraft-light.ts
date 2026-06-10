import type { ImageSource } from '../image.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the image id; no WebP import, no expo-asset on native.
// Web is handled by simiancraft-light.web.ts.
export const simiancraftLight: ImageSource = 'simiancraft-light';
