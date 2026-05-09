# react-native-webrtc-kaleidoscope — Agent Instructions

A managed-Expo-friendly Expo Module that registers named video frame processors with `react-native-webrtc` and exposes a typed JS facade. v0.1 ships `mirror` and `blur`.

## Status

Pre-1.0. The bootstrap-and-ship plan in `bootstrap-and-ship-v0-1.md` (root, while it exists) is the source of truth for the v0.1 scope. Follow the Inspector Gadget Rule: that plan deletes itself when v0.1 ships.

## Conventions

- Bun, TypeScript ESM, biome for lint+format, semantic-release driven by Conventional Commits.
- Native module shape: `src/` is the JS facade, `android/` is Kotlin, `ios/` is Swift, `plugin/` is the Expo config plugin (TypeScript, compiled to `plugin/build/`).
- `react-native-webrtc` is a **peer dependency**, not a direct dependency. Do not import it from `src/` runtime code beyond type-only imports.
- Frame processors are registered once at app boot via the config plugin. Do not move registration into a runtime-callable path.
- Web target uses `MediaStreamTrackProcessor` + `MediaStreamTrackGenerator` (Insertable Streams). Metro's `.web.ts` resolution swaps `src/index.ts` ↔ `src/index.web.ts`.

## The undocumented API

The headline upstream surface — `track._setVideoEffects(['name'])` on `MediaStreamTrack` from `react-native-webrtc` — is **public-but-non-standard**, not private. Underscore-prefix here marks "non-standard extension." See PR #1176, PR #1331, PR #1681 in the upstream repo, and `node_modules/react-native-webrtc/src/MediaStreamTrack.ts:130` once installed.

Before changing the JS facade in `src/index.ts`, **verify the upstream contract on the currently installed version of `react-native-webrtc`**. The shape is non-standard and may shift between minor versions.

## Native conventions

- **Android (Kotlin):** factories implement `com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface`. Frame buffers come in as `VideoFrame` (I420). Preserve rotation and timestamp on the way out.
- **iOS (Swift):** processors conform to the WebRTC frame-processor protocol declared in `react-native-webrtc/ios/RCTWebRTC/videoEffects/VideoFrameProcessor.h`. CoreImage / Vision is the natural toolkit.
- Registration objects (`Registration.kt`, `Registration.swift`) are the only file the config plugin should touch. Effect factories are pure and stateless across instances.
- Don't introduce React/RN imports into native code beyond what Expo Modules already provides.

## Commits

Conventional Commits, imperative tense, succinct. `feat:` → minor release; `fix:` → patch; `feat!:` or `BREAKING CHANGE:` footer → major. See [CONTRIBUTING.md](./CONTRIBUTING.md). Scope examples: `fix(android)`, `feat(blur)`, `feat(web)`, `chore(plugin)`.

## Reference

Sibling projects [chromonym](https://github.com/simiancraft/chromonym) and [unitforge](https://github.com/simiancraft/unitforge) are the architectural specimens for OSS-hygiene boilerplate, CI, release tooling, and documentation patterns. Match their template; do not invent a new one.
