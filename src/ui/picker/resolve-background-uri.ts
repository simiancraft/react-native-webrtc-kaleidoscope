// Native variant: the prebuild copied the curated WebP to a conventional
// in-bundle location; the native module returns a displayable `file://` URI for
// it (Android `file:///android_asset/...`, iOS the `Bundle.main` URL). No second
// copy of the image.
//
// The `resolveBackgroundUri` Expo function is optional here: a native build
// predating it (or a non-background effect build) simply lacks it, so guard with
// `?.` and fall back to the source (the preset name), which renders no thumbnail
// rather than crashing.

import { requireNativeModule } from 'expo-modules-core';
import type { ResolveBackgroundUri } from './resolve-background-uri.types';

interface BackgroundUriModule {
  readonly resolveBackgroundUri?: (id: string) => string | null;
}

// Resolve the module once, lazily — it is registered at the Expo module's
// OnCreate, before any picker renders. Hoisted out of the per-call path so a
// grid of N tiles does not perform N module lookups per render.
let cachedModule: BackgroundUriModule | undefined;
const nativeModule = (): BackgroundUriModule =>
  (cachedModule ??= requireNativeModule<BackgroundUriModule>('RnWebrtcKaleidoscope'));

export const resolveBackgroundUri: ResolveBackgroundUri = (id, source) =>
  nativeModule().resolveBackgroundUri?.(id) ?? source;
