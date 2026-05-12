<p align="center">
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/">
    <img src="https://img.shields.io/badge/▶%20Live%20demo-mirror%20%2B%20blur%20a%20webcam-4f46e5?style=for-the-badge" alt="Live demo" />
  </a>
</p>

# react-native-webrtc-kaleidoscope

[![npm version](https://img.shields.io/npm/v/react-native-webrtc-kaleidoscope?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-native-webrtc-kaleidoscope)
[![Types: included](https://img.shields.io/npm/types/react-native-webrtc-kaleidoscope?color=3178c6&logo=typescript)](https://www.npmjs.com/package/react-native-webrtc-kaleidoscope)
[![CI](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/actions/workflows/ci.yml/badge.svg)](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/codecov/c/github/simiancraft/react-native-webrtc-kaleidoscope?logo=codecov)](https://codecov.io/github/simiancraft/react-native-webrtc-kaleidoscope)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/simiancraft/react-native-webrtc-kaleidoscope/badge)](https://securityscorecards.dev/viewer/?uri=github.com/simiancraft/react-native-webrtc-kaleidoscope)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> Live video effects for `react-native-webrtc`, packaged as a managed-Expo-friendly Expo Module. v0.1 ships **mirror** and **blur** on iOS, Android, and web.

## Status

Pre-1.0. Active development. The bootstrap-and-ship plan in [`bootstrap-and-ship-v0-1.md`](./bootstrap-and-ship-v0-1.md) (root, while it exists) is the source of truth for v0.1.

The first usable release will be `v0.1.0`, shipping `mirror` and `blur` on all three platforms. Until then, the package is published as `0.1.0-alpha.x` for name reservation and integration testing.

## Install

```sh
bun add react-native-webrtc react-native-webrtc-kaleidoscope
```

`react-native-webrtc` is a peer dependency. Install it explicitly.

## Configure

Add the config plugin to `app.config.ts`:

```ts
export default {
  expo: {
    plugins: ['react-native-webrtc', 'react-native-webrtc-kaleidoscope'],
  },
};
```

Then rebuild native code:

```sh
bunx expo prebuild
```

## Use

```ts
import { mediaDevices } from 'react-native-webrtc';
import { applyVideoEffects } from 'react-native-webrtc-kaleidoscope';

const stream = await mediaDevices.getUserMedia({ video: true });
const [track] = stream.getVideoTracks();

applyVideoEffects(track, ['blur']);   // background blur
applyVideoEffects(track, ['mirror']); // horizontal flip
applyVideoEffects(track, []);          // clear all effects
```

Effects chain in array order.

## Platform support

| Platform | Mirror | Blur | Backend |
|---|---|---|---|
| iOS ≥ 15 | ✓ | ✓ | Apple Vision + Core Image |
| Android ≥ API 24 | ✓ | ✓ | MLKit Selfie Segmentation + RenderScript / RenderEffect |
| Chrome / Edge | ✓ | ✓ | MediaStreamTrackProcessor + MediaPipe Selfie Segmentation (WASM) |
| Safari | ✓ | ⚠ | No Insertable Streams; throws a typed error |
| Firefox | ✓ | ⚠ | Same; capability-check before calling |

## What this isn't

- **Not a fork of `react-native-webrtc`.** A thin layer over its undocumented `_setVideoEffects` registry on native, and `MediaStreamTrackProcessor` on web. Install it alongside `react-native-webrtc`.
- **Not a managed cloud SaaS.** Effects run locally on the device; the track stays peer-to-peer. No service, no API key, no per-minute billing.
- **Not a face-filter SDK.** Effects are background segmentation and frame transforms, not facial AR.
- **Not a streaming protocol replacement.** The transformed track plugs into your existing `RTCPeerConnection` pipeline.

## Reference

- [CONTRIBUTING.md](./CONTRIBUTING.md): setup, scripts, commit conventions.
- [AGENTS.md](./AGENTS.md): agent and contributor orientation.
- [SECURITY.md](./SECURITY.md): security policy and reporting.
- [NOTICE.md](./NOTICE.md): third-party attributions.
- Sibling projects: [chromonym](https://github.com/simiancraft/chromonym) and [unitforge](https://github.com/simiancraft/unitforge); same OSS-hygiene template.
