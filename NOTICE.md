# Notices and Attributions

react-native-webrtc-kaleidoscope ships under the MIT license (see [LICENSE](./LICENSE)). This document tracks third-party sources, standards, and trademarks referenced by the library and the effects it ships.

## Runtime peer dependency

- **react-native-webrtc** — MIT license. <https://github.com/react-native-webrtc/react-native-webrtc>. The `track._setVideoEffects(...)` JS surface, the Android `ProcessorProvider` registry, and the iOS `RTCVideoFrameProcessor` protocol all originate upstream. This package is a consumer of, not a fork of, that codebase.

## Native segmentation backends (used by the `blur` effect)

- **Apple Vision** (iOS) — system framework. `VNGeneratePersonSegmentationRequest`. Subject to the Apple SDK License Agreement.
- **MLKit Selfie Segmentation** (Android) — Apache License 2.0. Distributed by Google as a managed AAR. <https://developers.google.com/ml-kit/vision/selfie-segmentation>.
- **MediaPipe Selfie Segmentation** (web) — Apache License 2.0. Loaded as an `optionalDependency` so native consumers do not bundle the WASM payload. <https://github.com/google-ai-edge/mediapipe>.

## Algorithmic and architectural references

- **mrousavy/FaceBlurApp** — segmentation + GPU composite at 60–120 FPS. Different plumbing (camera-preview pipeline, not a WebRTC track), but the algorithmic shape of "mask + blurred copy + composite" is the same.
- **Volcomix/virtual-background** — TFLite WASM reference for the web blur composite.

## Trademarks

- "Apple", "Vision", "Core Image", and related Apple marks are trademarks of Apple Inc. Used here as nominative references only.
- "Google", "MLKit", and "MediaPipe" are trademarks of Google LLC. Used here as nominative references only.
- "WebRTC" is a project of the W3C and IETF.

This package is not affiliated with, endorsed by, or certified by Apple, Google, the W3C, or the `react-native-webrtc` project.

## Forward-looking discipline

Effects added after v0.1 that depend on new third-party code or registered marks must:

1. Cite the source (with a stable URL and version) in the effect's source code.
2. Add an attribution section to this document.
3. Disclaim affiliation, endorsement, or certification where appropriate.
4. Treat trademarked names as **nominative references** only.
