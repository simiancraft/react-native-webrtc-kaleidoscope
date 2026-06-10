// Native variant: the prebuild copied the curated WebP to a conventional
// in-bundle location; the native module returns a displayable URI for it
// (Android `asset:///...` so Fresco's asset fetcher loads it, iOS the
// `Bundle.main` file URL). No second copy of the image.
//
// The `resolveImageUri` Expo function is optional here: a native build
// predating it (or a non-background effect build) simply lacks it, so guard with
// `?.` and fall back to the source (the preset name), which renders no thumbnail
// rather than crashing.

import { requireNativeModule } from 'expo-modules-core';
import type { ResolveImageUri } from './resolve-image-uri.types';

interface ImageUriModule {
  readonly resolveImageUri?: (id: string) => string | null;
}

// Resolve the module once, lazily; it is registered at the Expo module's
// OnCreate, before any picker renders. Hoisted out of the per-call path so a
// grid of N tiles does not perform N module lookups per render.
let cachedModule: ImageUriModule | undefined;
const nativeModule = (): ImageUriModule =>
  (cachedModule ??= requireNativeModule<ImageUriModule>('RnWebrtcKaleidoscope'));

export const resolveImageUri: ResolveImageUri = (id, source) => {
  // A numeric source is a Metro asset module id (from `require('./foo.webp')`)
  // and is consumable directly by `<Image source={number}>`; the native module
  // resolves only string preset names, so pass numbers straight through.
  if (typeof source === 'number') return source;
  return nativeModule().resolveImageUri?.(id) ?? source;
};
