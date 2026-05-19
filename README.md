<p align="center">
  <img src="./docs/kaleidoscope-logo.png" alt="react-native-webrtc-kaleidoscope logo" width="180" />
</p>

# react-native-webrtc-kaleidoscope

[![status: alpha](https://img.shields.io/badge/status-alpha-orange)](#status)
[![npm version](https://img.shields.io/npm/v/react-native-webrtc-kaleidoscope?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-native-webrtc-kaleidoscope)
[![Types: included](https://img.shields.io/npm/types/react-native-webrtc-kaleidoscope?color=3178c6&logo=typescript)](https://www.npmjs.com/package/react-native-webrtc-kaleidoscope)
[![CI](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/actions/workflows/ci.yml/badge.svg)](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> Live video effects for `react-native-webrtc`, packaged as a managed-Expo-friendly Expo Module.

## Status

**Active development; not yet production-ready.** Published to npm as `0.1.0-alpha.x` for name reservation and integration testing. The npm presentation, marketing, and release-quality polish will come in a later pass; right now the README's job is to tell the truth about what works.

### What works today

- **Mirror** (horizontal flip).
- **Blur** (background blur, person stays sharp).
- **Background replacement** (composite a still PNG behind the segmented person; two bundled office presets, library-side asset pipeline).
- **Runtime tuning** of the GLSL effects; see the [Use](#use) section.

| Platform | Mirror | Blur | Background replacement | Notes |
|---|---|---|---|---|
| Web (Chrome / Edge) | ✓ | ✓ | ✓ | MediaStreamTrackProcessor + MediaPipe Selfie Segmentation (WASM, CDN) |
| Android (API 24+) | ✓ | ✓ | ✓ | OpenGL ES 3.0 + MLKit Selfie Segmentation |
| iOS (≥ 15) | — | — | — | Coming soon; transpilation pipeline in place, host implementation pending |
| Safari / Firefox | — | — | — | No Insertable Streams; `applyVideoEffects` throws a typed error |

### Coming soon

- **iOS support**, via the canonical GLSL transpiled to Metal Shading Language (`glslangValidator` → `spirv-cross --msl`). The pipeline is in the repo at `scripts/transpile-shaders.ts` and the GLSL canonical source lives in `shaders/`. The Swift host code that loads the metallib and runs the Metal pipeline is the next chunk of work.
- **Procedural backgrounds** (animated shaders behind the person, not just still images). Same composite path; the only new piece is each effect's background producer.
- A careful pass over the npm presentation, install docs, and demo polish before any "we recommend you use this" framing.

## Install

```sh
bun add react-native-webrtc react-native-webrtc-kaleidoscope
```

`react-native-webrtc` is a peer dependency. Install it explicitly.

### Using LiveKit?

If your project uses `@livekit/react-native` it pulls in `@livekit/react-native-webrtc`, a fork of upstream `react-native-webrtc` that preserves the same `videoEffects` native classes and the `_setVideoEffects` JS API. Kaleidoscope works against either fork; the Android Gradle script picks whichever one your autolinking surfaced.

```sh
bun add @livekit/react-native @livekit/react-native-webrtc react-native-webrtc-kaleidoscope
```

Pick one fork. Installing both upstream `react-native-webrtc` and `@livekit/react-native-webrtc` in the same app will cause native class collisions; that's the consumer's problem to resolve.

## Configure

Add the config plugin to `app.config.ts`:

```ts
export default {
  expo: {
    plugins: ['react-native-webrtc-kaleidoscope'],
  },
};
```

(`react-native-webrtc` 124.x does not ship a config plugin upstream; do not list it in `plugins`. If you are on a fork that adds one, add it explicitly.)

Then rebuild native code:

```sh
bunx expo prebuild
```

## Use

```ts
import { mediaDevices } from 'react-native-webrtc';
import {
  applyVideoEffects,
  setBlurSigma,
  setMaskHardness,
  setMaskThreshold,
} from 'react-native-webrtc-kaleidoscope';

const stream = await mediaDevices.getUserMedia({ video: true });
const [track] = stream.getVideoTracks();

applyVideoEffects(track, ['mirror']);
applyVideoEffects(track, ['blur']);
applyVideoEffects(track, [{ name: 'background-image', source: 'office-1' }]);
applyVideoEffects(track, []); // clear all effects

// Runtime tuning (effects pick up the new values on the next frame):
setBlurSigma(25);        // Gaussian σ; clamped to [0.5, 64], default 8.
setMaskHardness(0.2);    // smoothstep transition width; clamped to [0, 1]. 0 = soft halo, 1 = near-step. Default 0.5.
setMaskThreshold(0.7);   // smoothstep center; clamped to [0.05, 0.95]. Higher rejects low-confidence pixels. Default 0.5.
```

Effects chain in array order.

**Tuning note:** optimal values are platform-specific because each segmentation model (MediaPipe on web, MLKit on Android, Vision when iOS lands) produces a different confidence distribution. Working defaults on a typical well-lit scene:

| Platform | Blur sigma | Mask hardness | Mask threshold |
|---|---|---|---|
| Web (MediaPipe) | 25 | 0.2 | 0.85 |
| Android (MLKit) | 30 | 0.2 | 0.6 |

The library ships neutral defaults (8, 0.5, 0.5) and consumers tune at runtime via the API above; whether to ship the dialed-in values as platform-specific defaults is an open question waiting on iOS data.

## What this isn't

- **Not a fork of `react-native-webrtc`.** A thin layer over its undocumented `_setVideoEffects` registry on native, and `MediaStreamTrackProcessor` on web. Install alongside `react-native-webrtc`.
- **Not a managed cloud SaaS.** Effects run locally on the device; the track stays peer-to-peer. No service, no API key, no per-minute billing.
- **Not a face-filter SDK.** Effects are background segmentation and frame transforms, not facial AR.
- **Not a streaming protocol replacement.** The transformed track plugs into the consumer's existing `RTCPeerConnection` pipeline.

## Architecture

The codebase lives across four surfaces:

- `src/` — JS facade and shared types. `applyVideoEffects(track, effects)` plus runtime tuning setters.
- `src/web/` — WebGL2 pipeline. MediaPipe segmentation + GLSL composite. One shader file per stage in `src/web/shaders.ts`.
- `android/` — OpenGL ES 3.0 pipeline. MLKit segmentation (async, worker-thread, last-known-mask cache) + GLSL composite. Shaders inline in `gpu/Shaders.kt` as `const val` strings.
- `ios/` — Scaffold only; the canonical GLSL in `shaders/` will transpile to Metal Shading Language for the iOS path.

The composite shader (`shaders/composite.frag`) is the same GLSL source for every effect category (blur, background-image, future procedural backgrounds). Per-effect difference is upstream of the composite: how the `uBackground` texture gets produced.

See [`PATTERNS.md`](./PATTERNS.md) for the file-layout conventions, texture-orientation contract, and recipe for adding new effects, shaders, presets, or tunable parameters.

## Reference

- [CONTRIBUTING.md](./CONTRIBUTING.md): setup, scripts, commit conventions.
- [AGENTS.md](./AGENTS.md): agent and contributor orientation.
- [PATTERNS.md](./PATTERNS.md): codebase conventions and how-to-extend.
- [SECURITY.md](./SECURITY.md): security policy and reporting.
- [NOTICE.md](./NOTICE.md): third-party attributions.
- Sibling projects: [chromonym](https://github.com/simiancraft/chromonym) and [unitforge](https://github.com/simiancraft/unitforge); same OSS-hygiene template.

---

MIT licensed. © 2026 Jesse Harlin / [Simiancraft](https://github.com/simiancraft).
