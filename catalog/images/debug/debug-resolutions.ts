import type { ImageSource } from '../image.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the image id; no WebP import, no expo-asset on native.
// Web is handled by debug-resolutions.web.ts.
export const debugResolutions: ImageSource = 'debug-resolutions';
