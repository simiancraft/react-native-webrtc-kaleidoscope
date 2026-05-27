// Cross-file invariant guard: the native effect registries and the Expo Module
// Function bridges must agree across Android and iOS. These joints are
// stringly-typed (the upstream react-native-webrtc registry takes flat string
// names, and Expo Module Functions are matched by name), so a typo or a
// one-platform-only addition type-checks and compiles but breaks at runtime on
// the platform that is out of sync. This reads the source as text and pins the
// agreement; it has caught a half-wired iOS-only setter before.
//
// Background images are no longer asserted here: they moved to directory-
// discovery registration (the prebuild copies the consumer-curated set; each
// platform registers exactly what landed), so there is no static list to drift.
// The cross-platform risk that remains is the generative-shader catalog, pinned
// below.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const androidReg = read('../android/src/main/java/com/simiancraft/kaleidoscope/Registration.kt');
const iosReg = read('../ios/KaleidoscopeModule/Registration.swift');
const androidModule = read(
  '../android/src/main/java/com/simiancraft/kaleidoscope/KaleidoscopeModule.kt',
);
const iosModule = read('../ios/KaleidoscopeModule/KaleidoscopeModule.swift');
const androidShaders = read(
  '../android/src/main/java/com/simiancraft/kaleidoscope/gpu/ShadersGenerated.kt',
);
const iosGenerative = read('../ios/KaleidoscopeModule/shaders/GENERATIVE.txt');

const TRANSFORM_OPS = ['flip-x', 'flip-y', 'rotate-cw', 'rotate-ccw'] as const;

const expoFunctionNames = (src: string): string[] =>
  [...src.matchAll(/Function\("([^"]+)"\)/g)].map((m) => m[1] ?? '').sort();

// Names in the Android `GENERATIVE: Map<String, String> = mapOf("name" to X)`.
const androidGenerativeNames = (src: string): string[] => {
  const block = src.match(/val GENERATIVE[^{]*mapOf\(([\s\S]*?)\)/)?.[1] ?? '';
  return [...block.matchAll(/"([\w-]+)"\s+to\b/g)].map((m) => m[1] ?? '').sort();
};

const iosGenerativeNames = (txt: string): string[] =>
  txt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .sort();

describe('native registry parity', () => {
  test('every transform + blur effect name is registered on both platforms', () => {
    for (const name of [...TRANSFORM_OPS, 'blur']) {
      expect(androidReg, `Registration.kt missing "${name}"`).toContain(`"${name}"`);
      expect(iosReg, `Registration.swift missing "${name}"`).toContain(`"${name}"`);
    }
  });

  test('the generative-shader catalog agrees across platforms', () => {
    // Both the Android GENERATIVE map and the iOS GENERATIVE.txt are codegen
    // from the same GENERATIVE_SHADERS list; the generic processor + directory-
    // driven registration iterate them. If they drift, one platform silently
    // lacks a shader the other registers.
    expect(iosGenerativeNames(iosGenerative)).toEqual(androidGenerativeNames(androidShaders));
    expect(androidGenerativeNames(androidShaders).length).toBeGreaterThan(0);
  });

  test('the same Expo Module Functions exist on BOTH native modules (no half-wired bridge)', () => {
    // A JS call routes to requireNativeModule(...).setX; if that Function is
    // registered on only one platform, the call throws at runtime on the other.
    expect(expoFunctionNames(iosModule)).toEqual(expoFunctionNames(androidModule));
  });
});
