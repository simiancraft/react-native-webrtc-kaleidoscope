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
// Read the consumer's preset book and copy ONLY the referenced image-layer
// plates into the native bundle, so an app ships only what it curates. The
// book is parsed as text (no execution): the runtime source values are
// per-platform (a URL on web, a plate id on native), so they are not static
// specifiers; instead we read the book's imports and its `image` layers to
// learn which asset each composite references.
//
// Static-analyzability is the consumer's contract (documented in the README):
// each `image` layer is `{ id: '<id>', shader: 'image', source: <ref> }`, where
// <ref> is a `require('./x.webp')` literal, a single named import from a
// `.../images/<category>/<leaf>` specifier, or a `const X = ...require('./x.webp')...`
// binding (e.g. `Asset.fromModule(require('./x.webp')).uri`). The mod warns
// (never throws) on anything it cannot parse or resolve, matching the plugin's
// non-fatal contract.
//
// iOS copy (Xcode resource membership) rides with the mobile pass; this mod
// handles Android, which merges app assets into the build directly.
const PRESET_BOOK_FILENAME = 'kaleidoscope.presets.ts';

// local binding -> import specifier, for single named imports. Handles both
// `{ X }` and `{ X as Y }`; the LOCAL name (Y when aliased, else X) is what a
// layer's `source` expression references, so a packaged composite that imports
// `{ observationDeck as observationDeckPlate }` is resolved correctly.
function parseImports(source) {
  const imports = {};
  const re =
    /import\s*\{\s*([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?\s*\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(re)) {
    imports[m[2] || m[1]] = m[3];
  }
  // Also resolve `const X = ...require('spec')...` bindings so a layer `source`
  // can reference a consumer's own asset wrapped the idiomatic Expo way
  // (`const wolfCave = Asset.fromModule(require('./x.webp')).uri`). Imports win
  // on a name clash; the require specifier is what resolveAssetPath copies.
  const requireBindingRe =
    /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*[^;\n]*\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of source.matchAll(requireBindingRe)) {
    if (!(m[1] in imports)) imports[m[1]] = m[2];
  }
  return imports;
}

// Derive an image plate id from its source specifier: the basename without
// extension (e.g. './assets/backgrounds/wolf-cave.webp' -> 'wolf-cave',
// 'react-native-webrtc-kaleidoscope/images/underwater/oceanscape-dark' -> 'oceanscape-dark').
// Used only as the fallback id when an image layer omits an explicit `id`; it
// follows the same basename == id convention the runtime sends as the native
// `source`, so native resolves assets/images/<id>.webp.
function plateIdFromSpecifier(specifier) {
  const segment = specifier.substring(specifier.lastIndexOf('/') + 1);
  return segment.replace(/\.[^.]+$/, '');
}

// Composite `image` layers: extract every image layer's native plate id + asset
// specifier from a source file (the preset book, OR an imported composite). The
// plate id is the layer's `id` (the basename JS sends as the native `source`, so
// native resolves assets/images/<id>.webp); the specifier resolves to the
// .webp (a require() literal or a bare imported identifier). Every image layer
// is one asset family now (there is no separate background-image shape).
function parseImageRefs(source) {
  const imports = parseImports(source);
  const refs = [];
  const seen = new Set();
  // Each image-layer object: a flat brace group containing `shader: 'image'`.
  // Layer objects do not nest braces, so `[^{}]` is a safe body matcher.
  const layerRe = /\{([^{}]*shader\s*:\s*['"]image['"][^{}]*)\}/g;
  for (const m of source.matchAll(layerRe)) {
    const body = m[1];
    const sourceM = body.match(/source\s*:\s*(require\(\s*['"][^'"]+['"]\s*\)|[A-Za-z0-9_$]+)/);
    if (!sourceM) continue;
    const expr = sourceM[1];
    const requireLiteral = expr.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
    const specifier = requireLiteral ? requireLiteral[1] : imports[expr] || null;
    if (!specifier) continue;
    // The layer's `id` is what native resolves the plate by; fall back to the
    // asset basename (the id == basename convention) when a layer omits it.
    const idM = body.match(/\bid\s*:\s*['"]([\w-]+)['"]/);
    const id = idM ? idM[1] : plateIdFromSpecifier(specifier);
    if (seen.has(id)) continue;
    seen.add(id);
    refs.push({ id, specifier });
  }
  return refs;
}

// Resolve an imported-composite specifier (`<pkg>/composites/<name>`) to its
// source `.ts` on disk. The plates a packaged composite needs live one
// indirection past the book: the book imports the composite, the composite
// imports its images. Returns null for a non-composite specifier or an
// unresolvable package.
function resolveCompositeSource(specifier, projectRoot) {
  if (!/(^|\/)composites\/[\w-]+$/.test(specifier)) return null;
  const name = specifier.substring(specifier.lastIndexOf('/') + 1);
  try {
    const pkgJson = require.resolve('react-native-webrtc-kaleidoscope/package.json', {
      paths: [projectRoot],
    });
    const ts = path.join(path.dirname(pkgJson), 'composites', name, `${name}.ts`);
    return fs.existsSync(ts) ? ts : null;
  } catch {
    return null;
  }
}

// Every image plate the book needs: the image layers declared inline in the book
// PLUS the image layers inside every packaged composite the book imports. One
// source of truth for both the Android and iOS plate copy, so neither platform
// can drift from the book the way it did when only inline layers were scanned.
function collectImageRefs(bookSource, projectRoot) {
  const refs = [];
  const seen = new Set();
  // Resolve each layer's asset at collection time, where the source FILE's dir is
  // known: a relative specifier (a composite's `../../images/<category>/<leaf>`) resolves
  // against that dir; a package specifier resolves via the library export.
  const addFrom = (src, baseDir) => {
    for (const { id, specifier } of parseImageRefs(src)) {
      if (seen.has(id)) continue;
      seen.add(id);
      refs.push({ id, specifier, srcPath: resolveAssetPath(specifier, baseDir, projectRoot) });
    }
  };
  addFrom(bookSource, projectRoot);
  for (const specifier of Object.values(parseImports(bookSource))) {
    const compositePath = resolveCompositeSource(specifier, projectRoot);
    if (!compositePath) continue;
    try {
      addFrom(fs.readFileSync(compositePath, 'utf8'), path.dirname(compositePath));
    } catch {
      // Non-fatal: a composite we cannot read just contributes no plates.
    }
  }
  return refs;
}

// Resolve an `image` layer's `source` specifier to an on-disk WebP path.
function resolveAssetPath(specifier, baseDir, projectRoot) {
  // A relative/absolute specifier resolves against the file it appears in
  // (baseDir): the book's own dir for an inline layer, the composite's dir for an
  // imported composite's layer. The import omits the extension, so try the
  // `.webp` sibling first, then the literal path (a consumer's `require('./x.webp')`).
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    const abs = path.resolve(baseDir, specifier);
    for (const candidate of [`${abs}.webp`, abs]) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }
  // A bare package specifier resolves via the library's `<specifier>.webp` subpath.
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

// Every packaged composite the book imports, with the on-disk path of its
// `<name>.thumb.webp` sibling. Mirrors collectImageRefs but for composites'
// picker-tile thumbnails (different asset family: thumbs vs image-layer
// plates). The thumb's bundle id is `<composite-name>-thumb`; the suffix
// disambiguates from same-named image plates (e.g. observation-deck the plate
// vs observation-deck-thumb the scene preview).
function collectCompositeThumbRefs(bookSource, projectRoot) {
  const refs = [];
  const seen = new Set();
  for (const specifier of Object.values(parseImports(bookSource))) {
    const compositeTs = resolveCompositeSource(specifier, projectRoot);
    if (!compositeTs) continue;
    const name = specifier.substring(specifier.lastIndexOf('/') + 1);
    if (seen.has(name)) continue;
    const thumbPath = path.join(path.dirname(compositeTs), `${name}.thumb.webp`);
    if (!fs.existsSync(thumbPath)) continue;
    seen.add(name);
    refs.push({ id: `${name}-thumb`, srcPath: thumbPath });
  }
  return refs;
}

// Copy each `image`-layer plate into the Android app's assets under
// images/<id>.webp, so CompositeFactory can resolve it by the same basename id
// JS sends. Idempotent; non-fatal (warn, never throw).
function copyAndroidImages(projectRoot, platformProjectRoot) {
  const bookPath = path.join(projectRoot, PRESET_BOOK_FILENAME);
  let source;
  try {
    source = fs.readFileSync(bookPath, 'utf8');
  } catch {
    // No preset book at the project root; nothing to bundle (a consumer that
    // declares no image layers needs none). Non-fatal and quiet.
    return;
  }
  const refs = collectImageRefs(source, projectRoot);
  if (refs.length === 0) return;
  const destDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'assets', 'images');
  fs.mkdirSync(destDir, { recursive: true });
  const copiedIds = [];
  for (const { id, specifier, srcPath } of refs) {
    if (!srcPath) {
      console.warn(
        `[react-native-webrtc-kaleidoscope] Could not resolve image plate source for '${id}' (${specifier}); skipping. Asset references must be statically resolvable.`,
      );
      continue;
    }
    fs.copyFileSync(srcPath, path.join(destDir, `${id}.webp`));
    copiedIds.push(id);
  }
  console.log(
    `[react-native-webrtc-kaleidoscope] Copied ${copiedIds.length} image plate(s) into the Android bundle from ${PRESET_BOOK_FILENAME}.`,
  );
}

// Copy each packaged composite's `<name>.thumb.webp` into the Android app's
// assets under images/<id>-thumb.webp (same flat directory as image plates;
// the `-thumb` suffix keeps them disjoint). The picker's resolveBackgroundUri
// looks them up by the same basename. Mirrors copyAndroidImages.
function copyAndroidThumbnails(projectRoot, platformProjectRoot) {
  const bookPath = path.join(projectRoot, PRESET_BOOK_FILENAME);
  let source;
  try {
    source = fs.readFileSync(bookPath, 'utf8');
  } catch {
    return;
  }
  const refs = collectCompositeThumbRefs(source, projectRoot);
  if (refs.length === 0) return;
  const destDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'assets', 'images');
  fs.mkdirSync(destDir, { recursive: true });
  const copiedIds = [];
  for (const { id, srcPath } of refs) {
    fs.copyFileSync(srcPath, path.join(destDir, `${id}.webp`));
    copiedIds.push(id);
  }
  console.log(
    `[react-native-webrtc-kaleidoscope] Copied ${copiedIds.length} composite thumbnail(s) into the Android bundle.`,
  );
}

// Copy each `image`-layer plate into the iOS app target's resources and
// register each in the app target's Copy Bundle Resources build phase, so the
// WebP ships in the .app and CompositeProcessor can resolve it from Bundle.main by
// the same basename id JS sends. Mirrors copyAndroidImages (Android).
//
// Xcode flattens resource file references into the bundle root, so a plate added
// here lands as <id>.webp in Bundle.main; CompositeProcessor.plateURL resolves it via
// the flat Bundle.main lookup (it tries an images/ subdirectory first, which is a
// harmless miss under this flat layout). No manifest is written: image plates are
// discovered by the id in each JS composite `image` layer's `source`, not
// enumerated at native registration time. Idempotent and non-fatal (warn, never
// throw).
function copyIosImages(projectRoot, platformProjectRoot) {
  const bookPath = path.join(projectRoot, PRESET_BOOK_FILENAME);
  let source;
  try {
    source = fs.readFileSync(bookPath, 'utf8');
  } catch {
    // No preset book at the project root; nothing to bundle (a consumer that
    // declares no image layers needs none). Non-fatal and quiet.
    return;
  }
  const refs = collectImageRefs(source, projectRoot);
  if (refs.length === 0) return;

  let IOSConfig;
  try {
    // eslint-disable-next-line global-require
    ({ IOSConfig } = require(require.resolve('@expo/config-plugins', { paths: [projectRoot] })));
  } catch (error) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Could not load @expo/config-plugins to register iOS image plates; image layers may be missing at runtime. ${String(error)}`,
    );
    return;
  }
  const { XcodeUtils } = IOSConfig;

  let projectName;
  try {
    const xcodeprojDir = fs
      .readdirSync(platformProjectRoot)
      .find((entry) => entry.endsWith('.xcodeproj'));
    if (!xcodeprojDir) {
      console.warn(
        '[react-native-webrtc-kaleidoscope] No .xcodeproj under the iOS project root yet; skipping iOS image registration.',
      );
      return;
    }
    projectName = xcodeprojDir.replace(/\.xcodeproj$/, '');
  } catch (error) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Could not locate the iOS .xcodeproj; skipping iOS image registration. ${String(error)}`,
    );
    return;
  }

  const destDir = path.join(platformProjectRoot, projectName);
  fs.mkdirSync(destDir, { recursive: true });

  const copiedIds = [];
  for (const { id, specifier, srcPath } of refs) {
    if (!srcPath) {
      console.warn(
        `[react-native-webrtc-kaleidoscope] Could not resolve iOS image plate source for '${id}' (${specifier}); skipping. Asset references must be statically resolvable.`,
      );
      continue;
    }
    fs.copyFileSync(srcPath, path.join(destDir, `${id}.webp`));
    copiedIds.push(id);
  }
  if (copiedIds.length === 0) {
    console.warn(
      '[react-native-webrtc-kaleidoscope] No iOS image plates resolved; skipping pbxproj resource registration.',
    );
    return;
  }

  let project;
  try {
    project = XcodeUtils.getPbxproj(projectRoot);
  } catch (error) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Could not read the iOS pbxproj to add image plates; image layers may be missing at runtime. ${String(error)}`,
    );
    return;
  }
  for (const id of copiedIds) {
    XcodeUtils.addResourceFileToGroup({
      filepath: `${projectName}/${id}.webp`,
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
    `[react-native-webrtc-kaleidoscope] Bundled ${copiedIds.length} image plate(s) into the iOS app target from ${PRESET_BOOK_FILENAME}.`,
  );
}

// Copy each packaged composite's `<name>.thumb.webp` into the iOS app target's
// resources and register each in the pbxproj's Copy Bundle Resources phase,
// landing as `<name>-thumb.webp` in Bundle.main. Mirrors copyIosImages.
function copyIosThumbnails(projectRoot, platformProjectRoot) {
  const bookPath = path.join(projectRoot, PRESET_BOOK_FILENAME);
  let source;
  try {
    source = fs.readFileSync(bookPath, 'utf8');
  } catch {
    return;
  }
  const refs = collectCompositeThumbRefs(source, projectRoot);
  if (refs.length === 0) return;

  let IOSConfig;
  try {
    // eslint-disable-next-line global-require
    ({ IOSConfig } = require(require.resolve('@expo/config-plugins', { paths: [projectRoot] })));
  } catch (error) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Could not load @expo/config-plugins to register iOS composite thumbnails; picker thumbnails may be missing at runtime. ${String(error)}`,
    );
    return;
  }
  const { XcodeUtils } = IOSConfig;

  let projectName;
  try {
    const xcodeprojDir = fs
      .readdirSync(platformProjectRoot)
      .find((entry) => entry.endsWith('.xcodeproj'));
    if (!xcodeprojDir) return;
    projectName = xcodeprojDir.replace(/\.xcodeproj$/, '');
  } catch {
    return;
  }

  const destDir = path.join(platformProjectRoot, projectName);
  fs.mkdirSync(destDir, { recursive: true });

  const copiedIds = [];
  for (const { id, srcPath } of refs) {
    fs.copyFileSync(srcPath, path.join(destDir, `${id}.webp`));
    copiedIds.push(id);
  }
  if (copiedIds.length === 0) return;

  let project;
  try {
    project = XcodeUtils.getPbxproj(projectRoot);
  } catch (error) {
    console.warn(
      `[react-native-webrtc-kaleidoscope] Could not read the iOS pbxproj to add composite thumbnails; thumbnails may be missing at runtime. ${String(error)}`,
    );
    return;
  }
  for (const id of copiedIds) {
    XcodeUtils.addResourceFileToGroup({
      filepath: `${projectName}/${id}.webp`,
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
    `[react-native-webrtc-kaleidoscope] Bundled ${copiedIds.length} composite thumbnail(s) into the iOS app target.`,
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

  // Android: copy every referenced image plate into the app bundle at prebuild.
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
        copyAndroidImages(modRequest.projectRoot, modRequest.platformProjectRoot);
      } catch (error) {
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not copy image plates into the Android bundle; image layers may be missing at runtime. ${String(error)}`,
        );
      }
      try {
        copyAndroidThumbnails(modRequest.projectRoot, modRequest.platformProjectRoot);
      } catch (error) {
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not copy composite thumbnails into the Android bundle; picker thumbnails may be missing at runtime. ${String(error)}`,
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
    // Copy the referenced image plates into the iOS app target. Same non-fatal
    // contract as the patches above.
    if (platformProjectRoot && modRequest.projectRoot) {
      try {
        copyIosImages(modRequest.projectRoot, platformProjectRoot);
      } catch (error) {
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not bundle image plates into the iOS app target; image layers may be missing at runtime. ${String(error)}`,
        );
      }
      try {
        copyIosThumbnails(modRequest.projectRoot, platformProjectRoot);
      } catch (error) {
        console.warn(
          `[react-native-webrtc-kaleidoscope] Could not bundle composite thumbnails into the iOS app target; picker thumbnails may be missing at runtime. ${String(error)}`,
        );
      }
    }
    return result;
  };

  return config;
};

module.exports = withKaleidoscope;
