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
// We fix this at prebuild time by registering an iOS "dangerous" mod that
// patches the generated Podfile to declare
// `pod 'react-native-webrtc', :modular_headers => true`. We deliberately do NOT
// emit a global `use_modular_headers!`: that flips every pod to build as a
// Clang module, which regularly breaks React Native core pods that ship
// non-modular umbrella headers. A single per-pod opt-in is the narrow, supported
// fix that react-native-webrtc's own docs recommend.
//
// WHY this file requires nothing but Node builtins (no @expo/config-plugins):
// Expo's plugin resolver hardcodes the entry filename to `app.plugin.js` and
// loads it with `require()` from the file's REAL path. In the demo we consume
// this library via `file:..`, so on EAS the realpath is the repo root, where
// there is no node_modules (EAS only installs the demo subdirectory). A
// top-level `require('@expo/config-plugins')` therefore throws
// "Cannot find module '@expo/config-plugins'" on the EAS worker. Registering
// the dangerous mod by mutating `config.mods.ios.dangerous` directly removes
// that dependency, so the plugin loads identically from the symlinked demo, a
// normally-installed external consumer, and the EAS worker. The mod contract is
// the one @expo/config-plugins' own dangerous base provider calls: it invokes
// our mod as `nextMod({ ...config, modResults, modRequest })` and only requires
// the returned value to be the config object (it asserts `.mods` exists).
//
// This file is CommonJS, and the package is deliberately `type: commonjs`:
// Expo's plugin resolver loads app.plugin.js with `require()`, and a CommonJS
// entry sidesteps ESM-interop variance across the Node versions EAS workers run
// (older SDK images run Node 18, which cannot `require()` an ESM module at all;
// newer images run Node 20/22). The ESM-authored library source lives in `src/`
// and is consumed by Metro via the `react-native` export condition, never
// loaded by Node.

const fs = require('node:fs');
const path = require('node:path');

// A sentinel comment lets us find our own injection on re-prebuilds and stay
// idempotent regardless of how Expo regenerates the surrounding Podfile.
const SENTINEL = '# react-native-webrtc-kaleidoscope: modular headers (managed)';

// Resolve which react-native-webrtc fork the consumer installed, and return its
// CocoaPods pod name. Two forks ship the same JS/native surface under different
// names (mirrors the dual probe in android/build.gradle):
//   - @livekit/react-native-webrtc -> pod `livekit-react-native-webrtc`
//   - react-native-webrtc          -> pod `react-native-webrtc`
// We prefer the fork when both are present, matching the Swift import order
// (`#if canImport(livekit_react_native_webrtc)` first). Declaring a pod for a
// package that is not installed would break `pod install`, so we return null
// (and skip patching) when neither is found.
function resolveWebrtcPodName(projectRoot) {
  if (!projectRoot) {
    return 'react-native-webrtc';
  }
  const fork = path.join(projectRoot, 'node_modules', '@livekit', 'react-native-webrtc');
  const upstream = path.join(projectRoot, 'node_modules', 'react-native-webrtc');
  if (fs.existsSync(fork)) {
    return 'livekit-react-native-webrtc';
  }
  if (fs.existsSync(upstream)) {
    return 'react-native-webrtc';
  }
  return null;
}

// Ensure the Podfile builds the resolved react-native-webrtc pod with modular
// headers so our Swift can `import` it as a Clang module. Idempotent: running
// prebuild twice neither duplicates the line nor corrupts the Podfile.
function patchPodfile(contents, podName) {
  if (contents.includes(SENTINEL)) {
    return contents;
  }

  const block = `${SENTINEL}\n  pod '${podName}', :modular_headers => true`;
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
  if (!config.mods) {
    config.mods = {};
  }
  if (!config.mods.ios) {
    config.mods.ios = {};
  }

  // Chain any previously registered iOS dangerous mod so we cooperate with
  // other plugins instead of clobbering them.
  const previousMod = config.mods.ios.dangerous;

  config.mods.ios.dangerous = async (modConfig) => {
    const result = typeof previousMod === 'function' ? await previousMod(modConfig) : modConfig;
    const modRequest = result.modRequest || {};
    const platformProjectRoot = modRequest.platformProjectRoot;
    const podName = resolveWebrtcPodName(modRequest.projectRoot);
    if (platformProjectRoot && podName) {
      const podfilePath = path.join(platformProjectRoot, 'Podfile');
      try {
        const original = fs.readFileSync(podfilePath, 'utf8');
        const patched = patchPodfile(original, podName);
        if (patched !== original) {
          fs.writeFileSync(podfilePath, patched);
        }
      } catch (error) {
        // Non-fatal: surface a clear instruction rather than failing prebuild.
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not patch the Podfile to build ${podName} with modular headers; add "pod '${podName}', :modular_headers => true" inside your app target manually. ${String(error)}`,
        );
      }
    }
    return result;
  };

  return config;
};

module.exports = withKaleidoscope;
