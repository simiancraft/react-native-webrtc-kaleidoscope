/// <reference path="./assets.d.ts" />
import { Image, Platform } from 'react-native';
import office1Asset from './office-1.webp';

// Ready-to-use `source` for the `background-image` effect.
// - web: the bundled WebP's URL, which the web effect fetches.
// - native: the bare preset name; the native module loads its own bundled
//   resource, so the WebP import is unused at runtime on native.
export const office1: string =
  Platform.OS === 'web' ? (Image.resolveAssetSource(office1Asset)?.uri ?? '') : 'office-1';
