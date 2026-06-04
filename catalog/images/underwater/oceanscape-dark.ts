import type { ImageSource } from '../image.types';

// Native variant. The native module loads its own bundled resource by name, so
// the source is just the image id; no WebP import, no expo-asset on native.
// Web is handled by oceanscape-dark.web.ts.
export const oceanscapeDark: ImageSource = 'oceanscape-dark';
