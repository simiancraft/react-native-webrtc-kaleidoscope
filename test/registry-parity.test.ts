// Cross-file invariant guard: the native effect registries and the Expo Module
// Function bridges must agree across Android and iOS. These joints are
// stringly-typed (the upstream react-native-webrtc registry takes flat string
// names, and Expo Module Functions are matched by name), so a typo or a
// one-platform-only addition type-checks and compiles but breaks at runtime on
// the platform that is out of sync. This reads the .kt/.swift as text and pins
// the agreement; it caught a half-wired iOS-only `setSegmentationQuality`.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BACKGROUND_PRESETS } from '../src/backgrounds/presets';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const androidReg = read('../android/src/main/java/com/simiancraft/kaleidoscope/Registration.kt');
const iosReg = read('../ios/KaleidoscopeModule/Registration.swift');
const androidModule = read(
  '../android/src/main/java/com/simiancraft/kaleidoscope/KaleidoscopeModule.kt',
);
const iosModule = read('../ios/KaleidoscopeModule/KaleidoscopeModule.swift');

const TRANSFORM_OPS = ['flip-x', 'flip-y', 'rotate-cw', 'rotate-ccw'] as const;

const expoFunctionNames = (src: string): string[] =>
  [...src.matchAll(/Function\("([^"]+)"\)/g)].map((m) => m[1] ?? '').sort();

describe('native registry parity', () => {
  test('every transform + blur effect name is registered on both platforms', () => {
    for (const name of [...TRANSFORM_OPS, 'blur']) {
      expect(androidReg, `Registration.kt missing "${name}"`).toContain(`"${name}"`);
      expect(iosReg, `Registration.swift missing "${name}"`).toContain(`"${name}"`);
    }
  });

  test('every background preset is registered on both platforms', () => {
    for (const preset of BACKGROUND_PRESETS) {
      const name = `background-image-${preset}`;
      expect(androidReg, `Registration.kt missing "${name}"`).toContain(`"${name}"`);
      expect(iosReg, `Registration.swift missing "${name}"`).toContain(`"${name}"`);
    }
  });

  test('the same Expo Module Functions exist on BOTH native modules (no half-wired bridge)', () => {
    // A JS-exported setter calls requireNativeModule(...).setX; if that Function
    // is registered on only one platform, the call throws at runtime on the other.
    expect(expoFunctionNames(iosModule)).toEqual(expoFunctionNames(androidModule));
  });
});
