# Bootstrap react-native-webrtc-kaleidoscope and ship v0.1 (mirror + blur)

**Status:** Draft
**Scope:** subsystem
**Date:** 2026-05-07
**Last reviewed:** 2026-05-08
**Context:** Brand-new module repo. v0.1 ships two video effects (`mirror`, `blur`) as a managed-Expo-friendly Expo Module that registers native frame processors with `react-native-webrtc` (peer dep) and exposes a thin JS facade. In-repo `demo/` Expo app for hands-on verification on iOS / Android / web.

## Goal

Apps using `react-native-webrtc@124+` for video calls have no clean managed-Expo path to live video effects (background blur, virtual backgrounds) without adopting Fishjam Cloud's paid SaaS or forking the library. The capability already exists in stock `react-native-webrtc` via `track._setVideoEffects([...])` (PRs #1176, #1681) but is undocumented and has no published consumer.

This plan bootstraps `react-native-webrtc-kaleidoscope` — a small Expo Module that registers named video frame processors at app boot and exposes a typed JS facade — and ships v0.1 with two effects: `mirror` (no ML; proves architecture) and `blur` (segmentation + GPU Gaussian; the headline use case).

Done when both effects work end-to-end in the in-repo `demo/` Expo app on real iOS, real Android, and a Chrome-class browser, the package passes `bun run check:package`, and the OSS-hygiene template matches the `chromonym` / `unitforge` standard.

## Domain context

Five concepts the executing agent must hold:

1. **`track._setVideoEffects(['name'])`** — undocumented public-but-non-standard API on `MediaStreamTrack` from `react-native-webrtc` (`MediaStreamTrack.ts:130`). Native side dispatches to a registered `VideoFrameProcessor` factory by name. Local-tracks only. Plural API, chains; underscore is "non-standard extension," not "private" (see `_switchCamera`'s `@deprecated` JSDoc as evidence).
2. **`ProcessorProvider`** — the registry. Android: `com.oney.WebRTCModule.videoEffects.ProcessorProvider.addProcessor(name, factory)`. iOS: `ProcessorProvider.h` exposes the same shape. Registration happens once at app boot, in `MainApplication.onCreate()` (Android) and `application:didFinishLaunchingWithOptions:` (iOS).
3. **Expo Modules + config plugin** — the managed-Expo path to ship native code. Module's native code gets autolinked at prebuild; the config plugin injects MainApplication / AppDelegate registration calls. No ejection. `android/` and `ios/` stay ephemeral in consuming apps.
4. **Peer dependency, not re-export** — consuming app installs `react-native-webrtc` and this module independently. Native code in this module links against the rn-webrtc native libs already in the consumer's build graph.
5. **Cross-platform split** — native (iOS + Android) uses the registry. Web uses `MediaStreamTrackProcessor` + `MediaStreamTrackGenerator` (Insertable Streams) + `RTCRtpSender.replaceTrack()`. Same JS interface, two implementations, Metro's `.web.ts` resolution handles the swap.

### Quality reference (canonical templates)

This repo follows the **same OSS-hygiene template, scripts, and devDeps as the maintainer's two published sibling packages.** The next agent clones these two repos (or pulls the relevant files via raw GitHub) and replicates the structure:

- `https://github.com/simiancraft/chromonym` — shipped, polished. The authoritative template.
- `https://github.com/simiancraft/unitforge` — in-progress, identical template. Cross-reference for consistency.

Concrete artifacts to replicate (all present in both reference repos):

| Category | Files |
|---|---|
| Legal / attribution | `LICENSE` (MIT), `NOTICE.md`, `CODEOWNERS` |
| Community health | `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md` |
| Agent / LLM | `AGENTS.md`, `llms.txt` |
| Tooling configs | `biome.json`, `bunfig.toml`, `knip.json`, `codecov.yml`, `tsconfig.json`, `.gitattributes`, `.gitignore` |
| Release | `.releaserc.json` (semantic-release), `CHANGELOG.md` (auto-managed) |
| GitHub | `.github/FUNDING.yml`, `.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/{ci,deploy-demo,link-check,scorecard}.yml` |

Standard `package.json` scripts (verbatim from chromonym/unitforge): `clean`, `build`, `typecheck`, `lint`, `lint:fix`, `format`, `test`, `check:package`, `check:knip`, `demo`, `prepublishOnly`.

Standard devDeps: `@arethetypeswrong/cli`, `@biomejs/biome`, `@semantic-release/{changelog,git,npm}`, `@types/bun`, `@typescript/native-preview` (tsgo), `knip`, `publint`, `semantic-release`. Add `fast-check` only if property-based tests are useful.

**Adaptations for native-module shape (do NOT skip):**

- `build` script extends to compile the config plugin (`tsc -p plugin/`).
- `demo/` is an Expo app (Metro + Expo Router + web/iOS/Android targets), not Vite. The `bun run demo` script convention is preserved.
- Workflow `deploy-demo.yml` deploys Expo Web export to GitHub Pages (not Vite output). Concrete spec in Commit 2.
- Runtime peer dep `react-native-webrtc` and React Native build constraints (no Node-only globals in `src/`).

### Distribution targets

v0.1 ships **one public artifact: the web demo** on GitHub Pages, auto-deployed from `main` (Commit 2's `deploy-demo.yml`). Native targets (iOS, Android) are clone-and-run only — `bun run demo:ios` / `bun run demo:android` from a cloned working tree. **No APK release, no iOS simulator artifact, no TestFlight in v0.1.** README (Commit 14) documents the clone-and-run flow.

Effects must work on all three platforms (iOS native, Android native, web). Visual parity bar: **"visually similar enough."** Mirror is pixel-exact (no ML). Blur uses different segmentation models per platform (Apple Vision on iOS, MLKit on Android, MediaPipe-WASM on web), which produce slightly different masks; that is acceptable.

## Current surface area

Brand-new repo. Inventory before this plan executes:

| Location | State |
|---|---|
| Local working tree (this repo) | `.git/` initialized on `main`, this plan file, no other contents |
| Remote `origin` | `git@github.com:simiancraft/react-native-webrtc-kaleidoscope.git`, empty (no commits, no branches) |
| npm registry | `react-native-webrtc-kaleidoscope` available (verified) |
| Reference templates | `chromonym` and `unitforge` repos (publicly published; URLs in References) |

## File structure: before

```
react-native-webrtc-kaleidoscope/
├── .git/
└── bootstrap-and-ship-v0-1.md       # this plan
```

## File structure: after

**Legend:** `+` created, `~` modified

```
react-native-webrtc-kaleidoscope/
├── + .gitattributes                  // copy from chromonym
├── + .gitignore                      // chromonym base + Expo/Metro/Pods/build additions
├── + .releaserc.json                 // copy from chromonym
├── + AGENTS.md                       // adapted from chromonym; native-module specifics
├── + CHANGELOG.md                    // initial; semantic-release will rewrite later
├── + CODEOWNERS                      // copy from chromonym, swap owner
├── + CODE_OF_CONDUCT.md              // copy verbatim from chromonym
├── + CONTRIBUTING.md                 // adapted from chromonym
├── + LICENSE                         // MIT, copyright Jesse Harlin / Simiancraft 2026
├── + NOTICE.md                       // third-party attribution (rn-webrtc, MLKit, MediaPipe, Apple Vision)
├── + README.md                       // durable charter; install, usage, peer-dep, browser support matrix
├── + SECURITY.md                     // adapted from chromonym; report channel info@simiancraft.com
├── + biome.json                      // copy from chromonym
├── + bunfig.toml                     // copy from chromonym
├── + codecov.yml                     // copy from chromonym
├── + knip.json                       // copy from chromonym, adjust for plugin/ subdir
├── + llms.txt                        // adapted; describes the package's purpose for LLMs
├── + tsconfig.json                   // copy from chromonym; extend for RN/Expo paths
├── + package.json                    // standard scripts; peerDependencies: react-native-webrtc>=124
├── + bun.lock                        // generated by bun install
├── + expo-module.config.json         // declares this as an Expo Module
├── + app.plugin.js                   // entry point for config plugin
├── + .github/
│   ├── + FUNDING.yml
│   ├── + dependabot.yml
│   ├── + ISSUE_TEMPLATE/             // copy from chromonym
│   ├── + PULL_REQUEST_TEMPLATE.md
│   └── + workflows/
│       ├── + ci.yml                  // bun install, build, typecheck, test, check:package, check:knip
│       ├── + link-check.yml          // copy from chromonym
│       ├── + scorecard.yml           // copy from chromonym
│       └── + deploy-demo.yml         // adapted: Expo Web export deploy (or removed if infeasible)
├── + android/
│   ├── + build.gradle                // MLKit Selfie Segmentation dep
│   └── + src/main/java/com/simiancraft/kaleidoscope/
│       ├── + KaleidoscopeModule.kt           // Expo Module entry; calls Registration.registerAll()
│       ├── + Registration.kt                 // ProcessorProvider.addProcessor("mirror"|"blur", ...)
│       └── + effects/
│           ├── + MirrorFactory.kt            // VideoFrameProcessorFactoryInterface impl: horizontal flip
│           └── + BlurFactory.kt              // MLKit segmentation + GLES Gaussian + composite
├── + ios/
│   ├── + Kaleidoscope.podspec
│   └── + KaleidoscopeModule/
│       ├── + KaleidoscopeModule.swift        // Expo Module entry
│       ├── + Registration.swift              // ProcessorProvider.addProcessor calls
│       └── + effects/
│           ├── + MirrorProcessor.swift       // RTCVideoFrameProcessor protocol; horizontal flip
│           └── + BlurProcessor.swift         // VNGeneratePersonSegmentationRequest + CIGaussianBlur
├── + plugin/
│   ├── + tsconfig.json
│   └── + src/
│       └── + withKaleidoscope.ts             // injects registration into MainApplication / AppDelegate
├── + src/
│   ├── + index.ts                            // native entry; applyVideoEffects facade
│   ├── + index.web.ts                        // web entry; Insertable Streams impl
│   ├── + types.ts                            // EffectName union, ApplyVideoEffects signature
│   └── + web/
│       ├── + insertable-streams.ts           // MediaStreamTrackProcessor pipeline
│       └── + effects/
│           ├── + mirror.ts                   // canvas horizontal flip
│           └── + blur.ts                     // MediaPipe Selfie Segmentation WASM + canvas composite
└── + demo/
    ├── + package.json                        // private; deps: react-native-webrtc, kaleidoscope (file:..)
    ├── + app.config.ts                       // plugins: react-native-webrtc, react-native-webrtc-kaleidoscope
    ├── + tsconfig.json
    ├── + index.ts                            // Expo Router entry
    ├── + app/
    │   └── + index.tsx                       // local camera + effect toggle UI
    └── + src/
        ├── + use-loopback-stream.ts          // local MediaStream from getUserMedia
        └── + effect-toggles.tsx              // mirror / blur on/off buttons
```

## Commits

### Commit 1: Scaffold module via `create-expo-module`, reconcile with plan file

**Goal:** Standard Expo Module scaffold in place without overwriting this plan.

**Mechanic:** The plan file already exists at the repo root. `create-expo-module` creates the directory and may refuse if it isn't empty. Either (a) move the plan to `/tmp/` and back, or (b) scaffold to a sibling temp directory and `cp -r` contents in. Verify `bootstrap-and-ship-v0-1.md` survives intact at the root.

**Scaffolder prompts (suggested answers):**

| Prompt | Answer |
|---|---|
| npm package name | `react-native-webrtc-kaleidoscope` |
| Native module name | `RnWebrtcKaleidoscope` |
| JS module name | `RnWebrtcKaleidoscope` |
| Description | `Video effects for react-native-webrtc — managed-Expo-friendly registry of GPU shaders and ML-backed processors. Background blur, replace, and your own.` |
| Author | `Jesse Harlin <info@simiancraft.com>` |
| Repo URL | `https://github.com/simiancraft/react-native-webrtc-kaleidoscope` |
| License | `MIT` |

**Files created:** scaffold output — `package.json`, `tsconfig.json`, `expo-module.config.json`, `app.plugin.js`, `android/`, `ios/`, `src/`, `example/` (rename to `demo/` in Commit 9).

**Gate:** `bun install` completes. The scaffolder's default test/typecheck (whatever it scaffolds) passes. `bootstrap-and-ship-v0-1.md` still present at repo root.

### Commit 2: Apply chromonym/unitforge OSS-hygiene template

**Goal:** Match the user's published-package quality bar.

**Mechanic:** Clone or pull the chromonym and unitforge repos (URLs in References) — `gh repo clone simiancraft/chromonym /tmp/chromonym` etc. Copy the structural files listed in the Quality reference table; adapt prose for kaleidoscope's domain.

**Files created:**

- `LICENSE` — MIT, `Copyright (c) 2026 Jesse Harlin / Simiancraft`.
- `NOTICE.md` — third-party attribution: `react-native-webrtc` (MIT), MLKit (Apache 2.0), MediaPipe Selfie Segmentation (Apache 2.0), Apple Vision (system framework). Mirror chromonym's prose shape.
- `CODEOWNERS` — `* @the-simian` or per the user's chromonym pattern.
- `CODE_OF_CONDUCT.md` — verbatim copy from chromonym.
- `CONTRIBUTING.md` — adapt chromonym's; mention native-module-specific dev requirements (Bun, EAS, Xcode, Android Studio, simulator/device for native testing).
- `SECURITY.md` — adapt; report channel `info@simiancraft.com`.
- `AGENTS.md` — adapt chromonym's; add native-module specifics (no React imports in cloud-code style; Kotlin/Swift conventions; verify `_setVideoEffects` API on installed RN-WebRTC version before changing JS facade).
- `llms.txt` — adapt; describe kaleidoscope's purpose for LLM consumers.
- `biome.json`, `bunfig.toml`, `knip.json`, `codecov.yml`, `.gitattributes`, `.releaserc.json` — copy from chromonym; tweak `knip.json` to ignore `plugin/build/` and `dist/`.
- `.gitignore` — chromonym base plus Expo additions: `dist/`, `.expo/`, `*.tsbuildinfo`, `ios/Pods/`, `ios/build/`, `android/build/`, `android/.gradle/`, `node_modules/`.
- `tsconfig.json` — start from chromonym; extend for RN/Expo (`@types/react-native` jsx target, `moduleResolution: bundler`, paths).
- `.github/FUNDING.yml`, `.github/dependabot.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/` — copy from chromonym.
- `.github/workflows/ci.yml` — adapt: Bun setup, `bun install`, `bun run build`, `bun run typecheck`, `bun run test`, `bun run check:package`, `bun run check:knip`. Run on PRs and main pushes.
- `.github/workflows/link-check.yml`, `.github/workflows/scorecard.yml` — copy from chromonym.
- `.github/workflows/deploy-demo.yml` — on push to `main`, runs `bunx expo export -p web` in `demo/`, then deploys `dist/` to GitHub Pages via `actions/deploy-pages` (and `actions/upload-pages-artifact`). The Pages URL is the public web demo — the only public artifact in v0.1. Enable Pages in repo settings (`Settings → Pages → Source: GitHub Actions`) before the first run.

**Files rewritten:**

- `package.json` — standard scripts (`clean`, `build`, `typecheck`, `lint`, `lint:fix`, `format`, `test`, `check:package`, `check:knip`, `demo`, `prepublishOnly`); standard devDeps; `name`, `version: "0.1.0-alpha.1"`, `description`, `repository`, `bugs`, `homepage`, `keywords`, `license: "MIT"`, `peerDependencies` empty for now (added in Commit 3).
- `CHANGELOG.md` — initial `## [Unreleased]` section. Semantic-release rewrites later.

**Gate:** `bun run lint` passes. `bun run typecheck` passes. `bun run check:knip` passes. `git status` clean.

### Commit 3: Wire `react-native-webrtc` as peer dependency

**Goal:** Establish the dependency contract.

**Files rewritten:**

- `package.json` — `peerDependencies: { "react-native-webrtc": ">=124.0.0" }`. Add `devDependencies: { "react-native-webrtc": "^124.0.7" }` for typecheck convenience.

**Files created:**

- `src/types.ts`:
  ```ts
  export type EffectName = 'mirror' | 'blur';
  export type ApplyVideoEffects = (track: unknown, names: EffectName[]) => void;
  ```

**Gate:** `bun install` resolves cleanly (no peer warnings on the module itself; consumer warnings are expected). `bun run typecheck` passes.

### Commit 4: Implement Android `mirror`

**Goal:** Smallest possible native effect proving the registry on Android.

**Reference (read first):** `node_modules/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/videoEffects/VideoFrameProcessorFactoryInterface.java`. Confirm the exact signature before writing.

**Files created:**

- `android/src/main/java/com/simiancraft/kaleidoscope/effects/MirrorFactory.kt` — implements `VideoFrameProcessorFactoryInterface`. `process()` returns a new `VideoFrame` with the I420 buffer horizontally flipped (per-row reverse on Y plane; chroma planes reversed in U,V pairs at half resolution), preserving rotation and timestamp.
- `android/src/main/java/com/simiancraft/kaleidoscope/Registration.kt` — `object Registration { fun registerAll() { ProcessorProvider.addProcessor("mirror", MirrorFactory()) } }`.

**Files modified:**

- `android/src/main/java/com/simiancraft/kaleidoscope/KaleidoscopeModule.kt` — call `Registration.registerAll()` from the module's `OnCreate` block.

**Gate:** Module compiles (`cd demo && bunx expo prebuild -p android && cd android && ./gradlew assembleDebug`). Manual verification deferred to Commit 9.

### Commit 5: Implement iOS `mirror`

**Goal:** iOS counterpart.

**Reference (read first):** `node_modules/react-native-webrtc/ios/RCTWebRTC/videoEffects/VideoFrameProcessor.h` and `ProcessorProvider.h`. Confirm the exact protocol name and selector signature.

**Files created:**

- `ios/KaleidoscopeModule/effects/MirrorProcessor.swift` — conforms to the WebRTC frame processor protocol. Uses `CIImage.transformed(by: CGAffineTransform(scaleX: -1, y: 1))` then renders back through `CIContext` to produce a new RTC video frame.
- `ios/KaleidoscopeModule/Registration.swift` — `static func registerAll() { ProcessorProvider.addProcessor("mirror", MirrorProcessor()) }`.

**Files modified:**

- `ios/KaleidoscopeModule/KaleidoscopeModule.swift` — call `Registration.registerAll()` from the module's `OnCreate` block.

**Gate:** Module compiles (`cd demo && bunx expo prebuild -p ios && cd ios && pod install && xcodebuild -workspace ... -scheme ... -sdk iphonesimulator build`).

### Commit 6: Implement Web `mirror`

**Goal:** Web counterpart using Insertable Streams.

**API decision (resolve while writing):** the web `applyVideoEffects` may need access to the `RTCRtpSender` to call `replaceTrack`. Two options:
- (a) Extend `applyVideoEffects` signature: `applyVideoEffects(trackOrSender, names)` — overload by argument type.
- (b) Add a separate `connectVideoEffects(sender, names)` for web, keep `applyVideoEffects(track, names)` for native.

Pick one and document in `src/types.ts`. Recommend (a) for symmetry.

**Files created:**

- `src/web/insertable-streams.ts` — factory: takes a transform function, returns a pipeline that connects a `MediaStreamTrackProcessor` → transform → `MediaStreamTrackGenerator`, producing a new track. Handle teardown when the source ends.
- `src/web/effects/mirror.ts` — transform function: draw incoming `VideoFrame` to `OffscreenCanvas` with `ctx.scale(-1, 1)`, encode back to `VideoFrame`.
- `src/index.web.ts` — implements `applyVideoEffects` using the factory; manages per-track pipeline state.

**Gate:** `bun run typecheck` passes. `bun run build` produces clean dist for the web entry. Manual visual verification deferred to Commit 9.

### Commit 7: JS facade for native — `applyVideoEffects`

**Goal:** Thin facade over `track._setVideoEffects`.

**Files created:**

- `src/index.ts`:
  ```ts
  import type { EffectName } from './types';
  export type { EffectName, ApplyVideoEffects } from './types';
  export function applyVideoEffects(track: any, names: EffectName[]): void {
    if (track?.remote) throw new Error('kaleidoscope: cannot apply effects to remote tracks');
    if (typeof track?._setVideoEffects !== 'function') {
      throw new Error('kaleidoscope: track has no _setVideoEffects method (is react-native-webrtc >=124 installed?)');
    }
    track._setVideoEffects(names);
  }
  ```

**Files modified:**

- `package.json` — set `"main": "src/index"`, `"react-native": "src/index"`, `"types": "src/index.ts"`. Set `"exports"` map for both native and web entry points.

**Gate:** `bun run typecheck` passes. `bun run build` produces clean dist. `bun run check:package` passes (publint + attw).

### Commit 8: Config plugin — wire native registration into MainApplication / AppDelegate

**Goal:** Managed-Expo consumers get registration automatically at prebuild time.

**Files created:**

- `plugin/tsconfig.json` — extends root tsconfig; emits to `plugin/build/`.
- `plugin/src/withKaleidoscope.ts` — Expo config plugin using `withMainApplication` (Android) and `withAppDelegate` (iOS) from `@expo/config-plugins`. Injects:
  - Android: import `com.simiancraft.kaleidoscope.Registration` plus `Registration.registerAll()` call in `MainApplication.onCreate()`.
  - iOS: import + `[KaleidoscopeRegistration registerAll]` (or Swift bridge equivalent) in `application:didFinishLaunchingWithOptions:`.

**Files modified:**

- `app.plugin.js` — `module.exports = require('./plugin/build/withKaleidoscope').default;`.
- `package.json` — extend `build` script: `"build": "bun run clean && tsgo && tsc -p plugin/"`. Add `plugin/build/` to `files` allowlist.

**Gate:** `bun run build` produces both `dist/` and `plugin/build/`. Running `bunx expo prebuild` in `demo/` (after Commit 9 lands) produces native code that includes the registration calls (verify via grep). Test deferred to Commit 9.

### Commit 9: Scaffold the `demo/` Expo app

**Goal:** Real, in-repo demo where the maintainer toggles effects against a live local stream.

**Files created or moved:**

- Rename `example/` → `demo/` if scaffolder produced `example/`. Otherwise create `demo/` from scratch.
- `demo/package.json` — private, deps: `expo`, `expo-router`, `react`, `react-native`, `react-native-webrtc`, `react-native-webrtc-kaleidoscope: file:..` (or `link:..`).
- `demo/app.config.ts` — plugins: `react-native-webrtc`, `react-native-webrtc-kaleidoscope`. Permissions for camera, microphone.
- `demo/index.ts`, `demo/app/index.tsx` — single screen rendering `RTCView` with the local camera, two toggle buttons (Mirror / Blur).
- `demo/src/use-loopback-stream.ts` — hook that creates a local `MediaStream` via `mediaDevices.getUserMedia({ video: true })`. No peer connection needed for visual verification of effects.
- `demo/src/effect-toggles.tsx` — UI for toggling.
- `demo/tsconfig.json` — extends root.

**Files modified:**

- Root `package.json` — scripts: `"demo": "cd demo && bun run start"`, `"demo:ios": "cd demo && bun run ios"`, `"demo:android": "cd demo && bun run android"`, `"demo:web": "cd demo && bun run web"` (mirroring chromonym's `demo` script convention while accommodating Expo's three targets).

**Gate:** `bun run demo:web` opens browser, shows local camera, mirror toggle visibly flips video horizontally. At least one of `bun run demo:ios` or `bun run demo:android` builds and shows the same on a device or simulator. Blur toggle still inert (effect not implemented yet).

### Commit 10: Implement Android `blur`

**Goal:** Headline ML effect on Android.

**Files created:**

- `android/src/main/java/com/simiancraft/kaleidoscope/effects/BlurFactory.kt` — per-frame pipeline:
  1. Convert `VideoFrame` buffer to RGBA bitmap.
  2. Run MLKit Selfie Segmentation in `STREAM_MODE` → confidence mask.
  3. Apply Gaussian blur to a copy of the bitmap (use `RenderScript` `ScriptIntrinsicBlur` with sigma 25, or `RenderEffect.createBlurEffect` on API 31+ with platform fallback).
  4. Composite: per-pixel mix(blurred, original, mask).
  5. Convert composite back to I420 `VideoFrame` preserving rotation/timestamp.

**Files modified:**

- `android/build.gradle` — `implementation "com.google.mlkit:selfie-segmentation:16.0.0-beta6"` (verify latest stable at write time).
- `Registration.kt` — register `"blur"` factory.

**Gate:** Module compiles with new dependency. Demo app's blur toggle visibly blurs background on a real Android device. Frame rate stays above 15 FPS on a midrange device (informal smoke check, not a hard threshold).

### Commit 11: Implement iOS `blur`

**Goal:** Headline ML effect on iOS.

**Files created:**

- `ios/KaleidoscopeModule/effects/BlurProcessor.swift` — per-frame pipeline:
  1. Convert `RTCVideoFrame` buffer to `CVPixelBuffer` → `CIImage`.
  2. Run `VNGeneratePersonSegmentationRequest` (`.fast` quality, balanced quality if `.fast` looks bad) → mask `CIImage`.
  3. Apply `CIFilter.gaussianBlur(inputRadius: 25)` to background.
  4. Composite via `CIBlendWithMask`.
  5. Render back to `RTCVideoFrame`.

**Files modified:**

- `Registration.swift` — register `"blur"`.
- iOS deployment target stays >= 15.0 (Apple Vision person segmentation requirement); confirm in `Kaleidoscope.podspec`.

**Gate:** Module compiles. Demo app's blur toggle visibly blurs background on a real iOS device.

### Commit 12: Implement Web `blur`

**Goal:** Web counterpart using MediaPipe.

**Files created:**

- `src/web/effects/blur.ts` — transform function with one-time async setup:
  1. Lazy-load `@mediapipe/selfie_segmentation` on first frame.
  2. Per-frame: run segmentation → person mask.
  3. Draw blurred frame to `OffscreenCanvas` (use `ctx.filter = 'blur(15px)'` or a manual two-pass GLSL-ish approach if `ctx.filter` performance is poor).
  4. Composite via mask.
  5. Encode back to `VideoFrame`.

**Files modified:**

- `package.json` — add `@mediapipe/selfie_segmentation` to `optionalDependencies` (so native consumers don't bundle ~5 MB of WASM).
- `src/web/insertable-streams.ts` — extend pipeline to support transforms with async init (await first-frame setup before processing).

**Gate:** `bun run demo:web` blur toggle visibly blurs background on Chrome. Document that Firefox/Safari may require fallback (`MediaStreamTrackProcessor` not in Safari yet); gate gracefully with capability check, throw a typed error.

### Commit 13: Cross-platform smoke pass

**Goal:** Confirm both effects work on all three targets in a single coordinated check.

**Files modified:**

- `demo/app/index.tsx` — ensure both toggles wired, platform-specific quirks handled (Web's `RTCRtpSender.replaceTrack` requires the demo to spin up a peer connection or use the local stream directly with a transformed track for visual feedback).
- `README.md` — fill in the "Browser support" section based on what works.

**Manual verification:** real iOS device (mirror, blur, off, transitions); real Android device (same); Chrome (same); Firefox / Safari (verify graceful degradation with informative error).

**Gate:** All six toggle paths (3 platforms × 2 effects) verified at least once. Issues filed for any platform-specific limitations not solvable in v0.1.

### Commit 14: Documentation pass

**Goal:** Make the package usable by an outsider with no context.

**Files modified:**

- `README.md` — complete install (`bun add react-native-webrtc-kaleidoscope`), config-plugin setup snippet for `app.config.ts`, usage example with `applyVideoEffects(track, ['blur'])`, browser support matrix, FAQ ("why is the JS API named `_setVideoEffects` upstream?", "do I need to eject?", "can I add my own effects?" — answer the last one with a placeholder pointing to v0.3 work).
- `CHANGELOG.md` — full v0.1.0 entry.
- `package.json` — bump to `0.1.0`.
- `AGENTS.md` — final pass; ensure agents arriving in this repo know about the peer-dep contract and the `_setVideoEffects` undocumented-API caveat.

**Gate:** `bun run check:package` passes (publint + attw clean). `bun publish --dry-run` succeeds. README's install + usage block runs verbatim in the demo app.

### Commit 15: Delete this plan (Inspector Gadget Rule)

- Delete `bootstrap-and-ship-v0-1.md`.

**Gate:** `bun run check:knip` passes. `bun run lint` passes. `git grep -F 'bootstrap-and-ship-v0-1'` returns no results.

## Verification checklist

- [ ] `bun run build` produces clean `dist/` and `plugin/build/`.
- [ ] `bun run typecheck` passes.
- [ ] `bun run lint` passes.
- [ ] `bun run test` passes.
- [ ] `bun run check:package` passes (publint + attw).
- [ ] `bun run check:knip` passes.
- [ ] `bun run demo:web` boots and shows mirror + blur working.
- [ ] `bun run demo:ios` builds and runs on a device or simulator; mirror + blur work.
- [ ] `bun run demo:android` builds and runs on a device or emulator; mirror + blur work.
- [ ] `bunx expo prebuild` in `demo/` injects registration calls (grep verifies).
- [ ] `.github/workflows/ci.yml` green on a PR.
- [ ] OSS-hygiene file set matches chromonym/unitforge inventory.
- [ ] `bun publish --dry-run` succeeds.
- [ ] `CHANGELOG.md` has a complete v0.1.0 entry.
- [ ] `README.md` install block is copy-paste-runnable.
- [ ] Plan file deleted (Inspector Gadget Rule: no orphan plans).

## References

- `react-native-webrtc` PR #1176 — Android frame processor registry (merged 2022-10-04)
- `react-native-webrtc` PR #1331 — multiple frame processors + iOS scaffold (merged 2024-05-16)
- `react-native-webrtc` PR #1681 — iOS implementation rebase + cleanup (merged 2025-06-27)
- `node_modules/react-native-webrtc/src/MediaStreamTrack.ts:130` — `_setVideoEffects` JS surface (resolves after Commit 3)
- `node_modules/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/videoEffects/VideoFrameProcessorFactoryInterface.java` — Android interface to implement
- `node_modules/react-native-webrtc/ios/RCTWebRTC/videoEffects/VideoFrameProcessor.h` — iOS protocol to implement
- `mrousavy/FaceBlurApp` — segmentation + Skia composite at 60-120 FPS; algorithmic reference for blur (different plumbing — runs on the camera preview, not the WebRTC track)
- `Volcomix/virtual-background` — TFLite WASM reference for the web blur composite
- `https://github.com/simiancraft/chromonym` — quality template (canonical)
- `https://github.com/simiancraft/unitforge` — quality template (cross-reference)
