// Expo config plugin. Native registration happens via the Expo Module's
// OnCreate hook (see android/.../KaleidoscopeModule.kt and
// ios/.../KaleidoscopeModule.swift), not through a plugin-time mod.
//
// This plugin's job is narrowly scoped: patch the consumer's iOS build to
// satisfy this library's hard requirements that cannot be expressed in the
// Expo Module manifest or the podspec alone. Today that means two patches,
// both installed by a single iOS `dangerous` mod:
//
//   1. Declare `pod 'react-native-webrtc', :modular_headers => true` in the
//      generated Podfile so Swift sources can `import react_native_webrtc`
//      (see modular-headers detail below).
//   2. Raise `ios.deploymentTarget` in `Podfile.properties.json` to the value
//      required by `ios/Kaleidoscope.podspec`. The default Expo Podfile
//      platform (iOS 13.4) is lower than this library's minimum (iOS 15.0
//      for Apple Vision person segmentation), and `expo-modules-autolinking`
//      silently drops pods whose declared minimum exceeds the Podfile
//      platform — the library would build, install, and then be absent from
//      the generated `ExpoModulesProvider.swift` at runtime.
//
// Bounding invariant for future patches in this mod:
//   Every patch this mod installs must be (a) idempotent across re-prebuilds,
//   (b) non-downgrading (never reduce a value the consumer or another plugin
//   set higher), and (c) recoverable via a logged manual instruction on I/O
//   failure (no throwing — prebuild must keep going).
//
// Ordering note: this mod must run AFTER any consumer plugin that writes the
// same files (notably `expo-build-properties`). Expo executes plugins in
// declaration order from `plugins[]`, so consumers must list this plugin
// AFTER `expo-build-properties` in their `app.config.js`. The demo's
// `app.config.js` already does so.
//
// Modular-headers detail: our Swift sources do `import react_native_webrtc`
// to reach the Obj-C `ProcessorProvider` class and `VideoFrameProcessorDelegate`
// protocol that live inside the react-native-webrtc pod. For a Swift target to
// `import` an Objective-C CocoaPod as a Clang module, that pod must be built with
// modular headers. react-native-webrtc is NOT built with modular headers by
// default in a React Native / Expo app, so a default prebuild produces Swift
// that fails to compile with "no such module 'react_native_webrtc'".
//
// We deliberately do NOT emit a global `use_modular_headers!`: that flips every
// pod to build as a Clang module, which regularly breaks React Native core
// pods that ship non-modular umbrella headers. A single per-pod opt-in is the
// narrow, supported fix that react-native-webrtc's own docs recommend.
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

// Mirrors ios/Kaleidoscope.podspec :ios => '15.0'. Bumping the podspec
// requires bumping this constant; the drift cost is a silent pod-install
// drop (the bug this plan fixes).
const IOS_DEPLOYMENT_TARGET = '15.0';

// Compare two dotted version strings element-wise. Returns true iff `existing`
// is strictly less than `target`. Missing/empty existing counts as "less than".
// We avoid `semver` so this file stays dependency-free for EAS workers that
// don't install the library's node_modules. The library's iOS deployment
// target is a plain three-part version like '15.0' (or '15.0.1' if Apple ever
// requires it); pre-release/build metadata is not part of the contract.
function isVersionLessThan(existing, target) {
  if (typeof existing !== 'string' || existing.length === 0) {
    return true;
  }
  const toParts = (s) => s.split('.').map((part) => Number(part) || 0);
  const a = toParts(existing);
  const b = toParts(target);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av < bv) return true;
    if (av > bv) return false;
  }
  return false; // equal
}

// Resolve which react-native-webrtc fork the consumer installed, and return its
// CocoaPods pod name + npm package directory (used to build the `:path` for
// the Podfile declaration). Two forks ship the same JS/native surface under
// different names (mirrors the dual probe in android/build.gradle):
//   - @livekit/react-native-webrtc -> pod `livekit-react-native-webrtc`
//   - react-native-webrtc          -> pod `react-native-webrtc`
// We prefer the fork when both are present, matching the Swift import order
// (`#if canImport(livekit_react_native_webrtc)` first). Declaring a pod for a
// package that is not installed would break `pod install`, so we return null
// (and skip patching) when neither is found.
function resolveWebrtcPod(projectRoot) {
  if (!projectRoot) {
    return { podName: 'react-native-webrtc', packageDir: 'react-native-webrtc' };
  }
  const fork = path.join(projectRoot, 'node_modules', '@livekit', 'react-native-webrtc');
  const upstream = path.join(projectRoot, 'node_modules', 'react-native-webrtc');
  if (fs.existsSync(fork)) {
    return { podName: 'livekit-react-native-webrtc', packageDir: '@livekit/react-native-webrtc' };
  }
  if (fs.existsSync(upstream)) {
    return { podName: 'react-native-webrtc', packageDir: 'react-native-webrtc' };
  }
  return null;
}

// Ensure the Podfile builds the resolved react-native-webrtc pod with modular
// headers so our Swift can `import` it as a Clang module. Declare with an
// explicit `:path` (instead of a bare `pod 'name'`) so the build works even
// when RN autolinking does not register the pod for us — e.g. react-native-webrtc's
// own `react-native.config.js` only sets `module.exports` under
// `--use-react-native-macos`, and on EAS workers `use_native_modules!` has been
// observed to skip the pod entirely as a result. With `:path` provided here,
// CocoaPods resolves the local podspec directly; when autolinking also picks
// it up, the two identical-path declarations are merged and modular_headers
// is applied. Idempotent: running prebuild twice neither duplicates the line
// nor corrupts the Podfile.
function patchPodfile(contents, pod) {
  if (contents.includes(SENTINEL)) {
    return contents;
  }

  const block = `${SENTINEL}\n  pod '${pod.podName}', :path => '../node_modules/${pod.packageDir}', :modular_headers => true`;
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

// --- Prebuild asset copy (the precompiler) -------------------------------
//
// Read the consumer's preset book and copy ONLY the referenced background
// images into the native bundle, so an app ships only what it curates. The
// book is parsed as text (no execution): the runtime source values are
// per-platform (a URL on web, a preset name on native), so they are not static
// specifiers; instead we read the book's imports and its background-image
// entries to learn which library asset each preset references.
//
// Static-analyzability is the consumer's contract (documented in the README):
// each background-image entry is `'<id>': { shader: 'background-image',
// options: { source: <importedIdentifier> } }` on one line, and the identifier
// is a single named import from a `.../backgrounds/<name>` specifier. The mod
// warns (never throws) on anything it cannot parse or resolve, matching the
// plugin's non-fatal contract.
//
// iOS copy (Xcode resource membership) rides with the mobile pass; this mod
// handles Android, which merges app assets into the build directly.
const PRESET_BOOK_FILENAME = 'kaleidoscope.presets.ts';

// identifier -> import specifier, for single named imports.
function parseImports(source) {
  const imports = {};
  const re = /import\s*\{\s*([A-Za-z0-9_$]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(re)) {
    imports[m[1]] = m[2];
  }
  return imports;
}

// Background-image presets: book key (the id) -> source identifier.
function parseBackgroundRefs(source) {
  const imports = parseImports(source);
  const refs = [];
  // Capture the source expression up to the options-closing brace, then read a
  // specifier from it two ways: a `require('./asset')` literal (a consumer's own
  // asset) or a bare imported identifier (a library preset, resolved via its
  // import). Source expressions contain no `}`.
  const re =
    /['"]([\w-]+)['"]\s*:\s*\{\s*shader\s*:\s*['"]background-image['"]\s*,\s*options\s*:\s*\{\s*source\s*:\s*([^}]+?)\s*\}/g;
  for (const m of source.matchAll(re)) {
    const id = m[1];
    const expr = m[2];
    const requireLiteral = expr.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireLiteral) {
      refs.push({ id, specifier: requireLiteral[1] });
      continue;
    }
    const ident = expr.trim().match(/^([A-Za-z0-9_$]+)$/);
    if (ident && imports[ident[1]]) {
      refs.push({ id, specifier: imports[ident[1]] });
    }
  }
  return refs;
}

// Resolve a preset's source specifier to an absolute WebP path. Library presets
// expose the raw asset at the `<specifier>.webp` subpath export; a consumer's
// own asset is a relative path resolved against the project root.
function resolveAssetPath(specifier, projectRoot) {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    const abs = path.resolve(projectRoot, specifier);
    return fs.existsSync(abs) ? abs : null;
  }
  try {
    return require.resolve(`${specifier}.webp`, { paths: [projectRoot] });
  } catch {
    try {
      return require.resolve(specifier, { paths: [projectRoot] });
    } catch {
      return null;
    }
  }
}

// Copy each referenced background into the Android app's assets, named by its
// preset id, so native registration can discover it by id. Idempotent: a
// re-prebuild overwrites with the same bytes.
function copyAndroidBackgrounds(projectRoot, platformProjectRoot) {
  const bookPath = path.join(projectRoot, PRESET_BOOK_FILENAME);
  let source;
  try {
    source = fs.readFileSync(bookPath, 'utf8');
  } catch {
    console.warn(
      `[react-native-webrtc-kaleidoscope] No ${PRESET_BOOK_FILENAME} at the project root; skipping background copy. Create it per the README to curate bundled backgrounds.`,
    );
    return;
  }
  const refs = parseBackgroundRefs(source);
  if (refs.length === 0) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Parsed no background-image presets from ${PRESET_BOOK_FILENAME}; nothing copied. Check the entry shape documented in the README.`,
    );
    return;
  }
  const destDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'assets', 'backgrounds');
  fs.mkdirSync(destDir, { recursive: true });
  let copied = 0;
  for (const { id, specifier } of refs) {
    const srcPath = resolveAssetPath(specifier, projectRoot);
    if (!srcPath) {
      console.warn(
        `[react-native-webrtc-kaleidoscope] Could not resolve background source for '${id}' (${specifier}); skipping. Asset references must be statically resolvable.`,
      );
      continue;
    }
    fs.copyFileSync(srcPath, path.join(destDir, `${id}.webp`));
    copied += 1;
  }
  console.log(
    `[react-native-webrtc-kaleidoscope] Copied ${copied} curated background(s) into the Android bundle from ${PRESET_BOOK_FILENAME}.`,
  );
}

// Copy each referenced background into the iOS app target's resources, named by
// its preset id, and add each to the app target's Copy Bundle Resources build
// phase so the WebP ships in the .app and BackgroundImageProcessor can resolve
// it from Bundle.main. Also write a manifest (kaleidoscope-backgrounds.json, a
// JSON array of the copied ids) into the same resources and bundle it, so the
// iOS Registration can discover exactly the curated set without a hardcoded list
// (the iOS analogue of Android enumerating assets/backgrounds). Mirrors
// copyAndroidBackgrounds; idempotent and non-fatal on error (warn, never throw).
//
// @expo/config-plugins is loaded HERE, at mod runtime, via the realpath trick the
// file header documents (require.resolve from the consumer project root) so the
// top-level stays dependency-free for the EAS worker. We drive the raw pbxproj
// (IOSConfig.XcodeUtils) directly inside this dangerous mod rather than
// registering a separate withXcodeProject mod, which would force a top-level
// import.
function copyIosBackgrounds(projectRoot, platformProjectRoot) {
  const bookPath = path.join(projectRoot, PRESET_BOOK_FILENAME);
  let source;
  try {
    source = fs.readFileSync(bookPath, 'utf8');
  } catch {
    console.warn(
      `[react-native-webrtc-kaleidoscope] No ${PRESET_BOOK_FILENAME} at the project root; skipping iOS background copy. Create it per the README to curate bundled backgrounds.`,
    );
    return;
  }
  const refs = parseBackgroundRefs(source);
  if (refs.length === 0) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Parsed no background-image presets from ${PRESET_BOOK_FILENAME}; nothing copied for iOS. Check the entry shape documented in the README.`,
    );
    return;
  }

  // Resolve @expo/config-plugins from the consumer root so this never needs a
  // top-level import (EAS worker realpath has no node_modules). If it cannot be
  // resolved we cannot edit the pbxproj; warn and bail (non-fatal).
  let IOSConfig;
  try {
    // eslint-disable-next-line global-require
    ({ IOSConfig } = require(require.resolve('@expo/config-plugins', { paths: [projectRoot] })));
  } catch (error) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Could not load @expo/config-plugins to register iOS background resources; backgrounds may be missing at runtime. ${String(error)}`,
    );
    return;
  }
  const { XcodeUtils } = IOSConfig;
  // Derive the project name from the .xcodeproj directory on disk, NOT
  // IOSConfig.XcodeUtils.getProjectName: the latter resolves via getAppDelegate,
  // which on an Objective-C template (AppDelegate.mm) throws on Expo SDKs that
  // only recognise a Swift AppDelegate. The .xcodeproj dir name is the project
  // name and is template-agnostic. Bail (non-fatal) if none is found.
  let projectName;
  try {
    const xcodeprojDir = fs
      .readdirSync(platformProjectRoot)
      .find((entry) => entry.endsWith('.xcodeproj'));
    if (!xcodeprojDir) {
      console.warn(
        '[react-native-webrtc-kaleidoscope] No .xcodeproj under the iOS project root yet; skipping iOS background registration.',
      );
      return;
    }
    projectName = xcodeprojDir.replace(/\.xcodeproj$/, '');
  } catch (error) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Could not locate the iOS .xcodeproj; skipping iOS background registration. ${String(error)}`,
    );
    return;
  }

  // The Xcode group whose on-disk directory is <platformProjectRoot>/<projectName>/
  // is the standard place Expo plugins drop bundled app resources (alongside
  // Info.plist). Physically copy each WebP there, then reference it in the pbxproj
  // under the same group so the path stored matches the file on disk.
  const destDir = path.join(platformProjectRoot, projectName);
  fs.mkdirSync(destDir, { recursive: true });

  const copiedIds = [];
  for (const { id, specifier } of refs) {
    const srcPath = resolveAssetPath(specifier, projectRoot);
    if (!srcPath) {
      console.warn(
        `[react-native-webrtc-kaleidoscope] Could not resolve iOS background source for '${id}' (${specifier}); skipping. Asset references must be statically resolvable.`,
      );
      continue;
    }
    fs.copyFileSync(srcPath, path.join(destDir, `${id}.webp`));
    copiedIds.push(id);
  }
  if (copiedIds.length === 0) {
    console.warn(
      '[react-native-webrtc-kaleidoscope] No iOS backgrounds resolved; skipping pbxproj resource registration.',
    );
    return;
  }

  // Write the manifest the iOS Registration reads (a JSON array of ids).
  const manifestName = 'kaleidoscope-backgrounds.json';
  fs.writeFileSync(path.join(destDir, manifestName), `${JSON.stringify(copiedIds, null, 2)}\n`);

  // Add every copied WebP + the manifest to the app target's Copy Bundle
  // Resources. addResourceFileToGroup is idempotent: it skips a duplicate
  // filepath already in the group (logs only with verbose), so a re-prebuild
  // neither duplicates the build-file nor corrupts the project.
  let project;
  try {
    // getPbxproj takes the PROJECT root (parent of ios/) and globs ios/*.xcodeproj.
    project = XcodeUtils.getPbxproj(projectRoot);
  } catch (error) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Could not read the iOS pbxproj to add background resources; backgrounds may be missing at runtime. ${String(error)}`,
    );
    return;
  }
  const filenames = [...copiedIds.map((id) => `${id}.webp`), manifestName];
  for (const filename of filenames) {
    XcodeUtils.addResourceFileToGroup({
      filepath: `${projectName}/${filename}`,
      groupName: projectName,
      isBuildFile: true,
      project,
      verbose: false,
    });
  }
  fs.writeFileSync(
    path.join(platformProjectRoot, `${projectName}.xcodeproj`, 'project.pbxproj'),
    project.writeSync(),
  );
  console.log(
    `[react-native-webrtc-kaleidoscope] Bundled ${copiedIds.length} curated background(s) + manifest into the iOS app target from ${PRESET_BOOK_FILENAME}.`,
  );
}

const withKaleidoscope = (config) => {
  if (!config.mods) {
    config.mods = {};
  }
  if (!config.mods.ios) {
    config.mods.ios = {};
  }
  if (!config.mods.android) {
    config.mods.android = {};
  }

  // Android: copy the curated backgrounds into the app bundle at prebuild.
  // Registered the same dependency-free way as the iOS mod below (mutate
  // config.mods directly so no @expo/config-plugins import is needed on EAS).
  const previousAndroidDangerous = config.mods.android.dangerous;
  config.mods.android.dangerous = async (modConfig) => {
    const result =
      typeof previousAndroidDangerous === 'function'
        ? await previousAndroidDangerous(modConfig)
        : modConfig;
    const modRequest = result.modRequest || {};
    if (modRequest.platformProjectRoot && modRequest.projectRoot) {
      try {
        copyAndroidBackgrounds(modRequest.projectRoot, modRequest.platformProjectRoot);
      } catch (error) {
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not copy curated backgrounds into the Android bundle; backgrounds may be missing at runtime. ${String(error)}`,
        );
      }
    }
    return result;
  };

  // Chain any previously registered iOS dangerous mod so we cooperate with
  // other plugins instead of clobbering them.
  const previousMod = config.mods.ios.dangerous;

  config.mods.ios.dangerous = async (modConfig) => {
    const result = typeof previousMod === 'function' ? await previousMod(modConfig) : modConfig;
    const modRequest = result.modRequest || {};
    const platformProjectRoot = modRequest.platformProjectRoot;
    const pod = resolveWebrtcPod(modRequest.projectRoot);
    if (platformProjectRoot && pod) {
      const podfilePath = path.join(platformProjectRoot, 'Podfile');
      try {
        const original = fs.readFileSync(podfilePath, 'utf8');
        const patched = patchPodfile(original, pod);
        if (patched !== original) {
          fs.writeFileSync(podfilePath, patched);
        }
      } catch (error) {
        // Non-fatal: surface a clear instruction rather than failing prebuild.
        const manualLine = `pod '${pod.podName}', :path => '../node_modules/${pod.packageDir}', :modular_headers => true`;
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not patch the Podfile to build ${pod.podName} with modular headers; add "${manualLine}" inside your app target manually. ${String(error)}`,
        );
      }
    }
    if (platformProjectRoot) {
      // Raise the consumer's iOS deployment target via Podfile.properties.json.
      // The generated Podfile reads `podfile_properties['ios.deploymentTarget']`
      // at the top, so this is the canonical, no-Podfile-edit override seam.
      // `expo-modules-autolinking`'s package-filter silently drops any pod
      // whose declared minimum platform exceeds the Podfile platform; without
      // this bump the Kaleidoscope pod is dropped and the runtime module
      // lookup throws.
      const propsPath = path.join(platformProjectRoot, 'Podfile.properties.json');
      try {
        let parsed = {};
        try {
          const raw = fs.readFileSync(propsPath, 'utf8');
          try {
            const candidate = JSON.parse(raw);
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
              parsed = candidate;
            }
          } catch (jsonError) {
            // Corrupt JSON: warn but proceed with `{}` so the build still gets
            // the bump it needs. The next prebuild will fully regenerate the
            // file anyway.
            console.warn(
              `[react-native-webrtc-kaleidoscope] Could not parse ${propsPath}; rewriting with defaults. ${String(jsonError)}`,
            );
            parsed = {};
          }
        } catch (readError) {
          if (readError && readError.code === 'ENOENT') {
            parsed = {};
          } else {
            // Transient I/O failure (EACCES, EMFILE, ...). Don't clobber the
            // file when we couldn't actually read it; warn and bail.
            console.warn(
              `[react-native-webrtc-kaleidoscope] Could not read ${propsPath}; skipping iOS deployment-target bump. ${String(readError)}`,
            );
            return result;
          }
        }
        // Explicit own-key copy into a fresh object to foreclose
        // `__proto__`-as-literal-key surprises from JSON.parse.
        const next = {};
        for (const key of Object.keys(parsed)) {
          next[key] = parsed[key];
        }
        const existing = next['ios.deploymentTarget'];
        if (isVersionLessThan(existing, IOS_DEPLOYMENT_TARGET)) {
          next['ios.deploymentTarget'] = IOS_DEPLOYMENT_TARGET;
        }
        fs.writeFileSync(propsPath, `${JSON.stringify(next, null, 2)}\n`);
      } catch (error) {
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not patch ${propsPath} to raise iOS deployment target; add "ios.deploymentTarget": "${IOS_DEPLOYMENT_TARGET}" to Podfile.properties.json under your demo/ios directory manually. ${String(error)}`,
        );
      }
    }
    // Copy the curated backgrounds into the iOS app target + write the manifest
    // the iOS Registration reads. Same non-fatal contract as the patches above.
    if (platformProjectRoot && modRequest.projectRoot) {
      try {
        copyIosBackgrounds(modRequest.projectRoot, platformProjectRoot);
      } catch (error) {
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not bundle curated backgrounds into the iOS app target; backgrounds may be missing at runtime. ${String(error)}`,
        );
      }
    }
    return result;
  };

  return config;
};

module.exports = withKaleidoscope;
