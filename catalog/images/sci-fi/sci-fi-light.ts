import type { ImageSource } from '../image.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the image id; no WebP import, no expo-asset on native.
// Web is handled by sci-fi-light.web.ts.
export const sciFiLight: ImageSource = 'sci-fi-light';
