// Expo config plugin. Native registration happens via the Expo Module's
// OnCreate hook (see android/.../KaleidoscopeModule.kt and
// ios/.../KaleidoscopeModule.swift), not through a plugin-time mod.
//
// The one thing we cannot express in the Expo Module itself is an iOS build
// requirement on a sibling pod: our Swift sources do `import react_native_webrtc`
// to reach the Obj-C `ProcessorProvider` class and `VideoFrameProcessorDelegate`
// protocol that live inside the react-native-webrtc pod. For a Swift target to
// `import` an Objective-C CocoaPod as a Clang module, that pod must be built with
// modular headers. react-native-webrtc is NOT built with modular headers by
// default in a React Native / Expo app, so a default prebuild produces Swift
// that fails to compile with "no such module 'react_native_webrtc'".
//
// We fix this at prebuild time with a withDangerousMod that patches the generated
// iOS Podfile to declare `pod 'react-native-webrtc', :modular_headers => true`.
// We deliberately do NOT emit a global `use_modular_headers!`: that flips every
// pod to build as a Clang module, which regularly breaks React Native core pods
// that ship non-modular umbrella headers. A single per-pod opt-in is the narrow,
// supported fix that react-native-webrtc's own docs recommend.
//
// This file is CommonJS on purpose, and the package is deliberately
// `type: commonjs`, not `type: module`. Expo's plugin resolver hardcodes the
// entry filename to `app.plugin.js` (see @expo/config-plugins plugin-resolver)
// and loads it with `require()`. Under the Node 18 used by EAS Build workers,
// `require()` of an ESM file throws "Cannot use import statement outside a
// module" (ERR_REQUIRE_ESM). A `type: module` package would make this `.js`
// file ESM and break the load on EAS, so the entry, and therefore the package
// default, stays CommonJS. The ESM-authored library source lives in `src/` and
// is consumed by Metro via the `react-native` export condition, never loaded by
// Node, so the package `type` does not affect it. We must NOT plant a
// `dist/package.json` to mark the build output ESM: Expo resolves the plugin by
// walking `find-up` from the resolved package main (`dist/index.js`), and a
// `dist/package.json` would become the nearest package root, sending the
// `app.plugin.js` lookup into `dist/` where it does not exist and silently
// disabling the plugin.

const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

// A sentinel comment lets us find our own injection on re-prebuilds and stay
// idempotent regardless of how Expo regenerates the surrounding Podfile.
const SENTINEL = '# react-native-webrtc-kaleidoscope: modular headers (managed)';
const POD_LINE = "  pod 'react-native-webrtc', :modular_headers => true";

// Ensure the Podfile builds react-native-webrtc with modular headers so our
// Swift can `import react_native_webrtc`. Idempotent: running prebuild twice
// neither duplicates the line nor corrupts the Podfile.
function patchPodfile(contents) {
  if (contents.includes(SENTINEL)) {
    return contents;
  }

  const block = `${SENTINEL}\n${POD_LINE}`;
  const lines = contents.split('\n');

  // Insert just inside the first `target ... do` block so the per-pod
  // declaration sits in the same scope as the autolinked React Native pods.
  const targetIndex = lines.findIndex((line) => /^\s*target\s+['"].*['"]\s+do\b/.test(line));
  if (targetIndex !== -1) {
    lines.splice(targetIndex + 1, 0, block);
    return lines.join('\n');
  }

  // No `target` block found (unexpected for an Expo-generated Podfile); append
  // the declaration so the build requirement is at least present.
  return `${contents.trimEnd()}\n${block}\n`;
}

const withKaleidoscope = (config) => {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      try {
        const original = fs.readFileSync(podfilePath, 'utf8');
        const patched = patchPodfile(original);
        if (patched !== original) {
          fs.writeFileSync(podfilePath, patched);
        }
      } catch (error) {
        // Non-fatal: surface a clear instruction rather than failing prebuild.
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not patch the Podfile to build react-native-webrtc with modular headers; add "pod 'react-native-webrtc', :modular_headers => true" inside your app target manually. ${String(error)}`,
        );
      }
      return modConfig;
    },
  ]);
};

module.exports = withKaleidoscope;
