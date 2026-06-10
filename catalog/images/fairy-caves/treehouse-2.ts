import type { ImageSource } from '../image.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the image id; no WebP import, no expo-asset on native.
// Web is handled by treehouse-2.web.ts.
export const treehouse2: ImageSource = 'treehouse-2';
