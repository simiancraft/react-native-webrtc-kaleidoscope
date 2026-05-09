# react-native-webrtc-kaleidoscope

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

## Reference

- [CONTRIBUTING.md](./CONTRIBUTING.md) — setup, scripts, commit conventions
- [AGENTS.md](./AGENTS.md) — agent / contributor orientation
- [SECURITY.md](./SECURITY.md) — security policy and reporting
- [NOTICE.md](./NOTICE.md) — third-party attributions
- Sibling projects: [chromonym](https://github.com/simiancraft/chromonym), [unitforge](https://github.com/simiancraft/unitforge) — same OSS-hygiene template
