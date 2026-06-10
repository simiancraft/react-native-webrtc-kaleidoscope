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
import { readdirSync, readFileSync } from 'node:fs';

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
const webShaderSources = read('../web-driver/shaders.generated.ts');

const TRANSFORM_OPS = ['flip-x', 'flip-y', 'rotate-cw', 'rotate-ccw'] as const;

// Layer shaders the compositor resolves intrinsically (not generative): the raw
// camera, a bundled image, and the camera blur. Everything else a composite
// names is a generative that must be registered on every platform.
const BUILT_IN_SHADERS = new Set(['image', 'direct', 'blur']);

// Keys in the web `SHADER_SOURCES: ... = { name: X, 'two-words': Y }`.
const webGenerativeNames = (src: string): string[] => {
  const block = src.match(/SHADER_SOURCES[^{]*\{([\s\S]*?)\}/)?.[1] ?? '';
  return [...block.matchAll(/['"]?([\w-]+)['"]?\s*:/g)].map((m) => m[1] ?? '').sort();
};

// Every generative shader a native composite (.ts, what Metro resolves on
// device) references. Built-ins are excluded; the rest must be registered.
const compositeGenerativeRefs = (): string[] => {
  const names = new Set<string>();
  const dir = new URL('../catalog/composites/', import.meta.url);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let src: string;
    try {
      src = read(`../catalog/composites/${entry.name}/${entry.name}.ts`);
    } catch {
      continue;
    }
    for (const m of src.matchAll(/shader:\s*['"]([\w-]+)['"]/g)) {
      const name = m[1] ?? '';
      if (!BUILT_IN_SHADERS.has(name)) names.add(name);
    }
  }
  return [...names];
};

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
  test('every transform op + the composite compositor is registered on both platforms', () => {
    // The art axis collapsed to one registered "composite" compositor (blur,
    // images, and generative shaders are now layers inside a composite, delivered
    // via setCompositeLayers); only the four geometric transforms stay statically
    // named alongside it. The old per-effect names ("blur", "background-image-<id>",
    // the bare generative names) are gone on both platforms.
    for (const name of [...TRANSFORM_OPS, 'composite']) {
      expect(androidReg, `Registration.kt missing "${name}"`).toContain(`"${name}"`);
      expect(iosReg, `Registration.swift missing "${name}"`).toContain(`"${name}"`);
    }
  });

  test('the generative-shader catalog agrees across the live consumers', () => {
    // The Android GENERATIVE map (which LayerShaders.GENERATIVE reads directly),
    // the iOS GENERATIVE.txt, and the web SHADER_SOURCES registry (which
    // LAYER_SHADER_SOURCES re-exports) are all single-sourced from the same
    // GENERATIVE_SHADERS list. If any drifts, a platform silently lacks a shader
    // the others register.
    const android = androidGenerativeNames(androidShaders);
    expect(android.length).toBeGreaterThan(0);
    expect(iosGenerativeNames(iosGenerative)).toEqual(android);
    expect(webGenerativeNames(webShaderSources)).toEqual(android);
  });

  test('every generative a native composite references is registered', () => {
    // Guards the corporate-blobs class of bug: a composite's .ts naming a shader
    // that is not in the platform's generative set drops that layer silently at
    // runtime (it does not type-check or fail the build).
    const android = androidGenerativeNames(androidShaders);
    for (const shader of compositeGenerativeRefs()) {
      expect(android, `composite references generative "${shader}" not in the registry`).toContain(
        shader,
      );
    }
  });

  test('the same Expo Module Functions exist on BOTH native modules (no half-wired bridge)', () => {
    // A JS call routes to requireNativeModule(...).setX; if that Function is
    // registered on only one platform, the call throws at runtime on the other.
    expect(expoFunctionNames(iosModule)).toEqual(expoFunctionNames(androidModule));
  });

  test('resolveImageUri (picker native thumbnails) is bridged on both platforms', () => {
    // The picker's platform-split resolver calls mod.resolveImageUri?.(id)
    // keyed on the book id; both natives must define it (and key on that id) or
    // native thumbnails silently fall back to the label-only placeholder.
    expect(expoFunctionNames(androidModule)).toContain('resolveImageUri');
    expect(expoFunctionNames(iosModule)).toContain('resolveImageUri');
  });
});
