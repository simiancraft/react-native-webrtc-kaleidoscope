# Notices and Attributions

react-native-webrtc-kaleidoscope ships under the MIT license (see [LICENSE](./LICENSE)). This document tracks third-party sources, standards, and trademarks referenced by the library and the effects it ships.

## Runtime peer dependency

- **react-native-webrtc**: MIT license. <https://github.com/react-native-webrtc/react-native-webrtc>. The `track._setVideoEffects(...)` JS surface, the Android `ProcessorProvider` registry, and the iOS `RTCVideoFrameProcessor` protocol all originate upstream. This package is a consumer of, not a fork of, that codebase.

## Segmentation backends (used by the segmentation mask that drives the `blur` and image layers)

All three platforms run Google's MediaPipe selfie segmentation. The native targets use the MediaPipe Tasks Image Segmenter with a model bundled in this package; the web target uses the legacy MediaPipe Selfie Segmentation Solution loaded at runtime from a CDN.

- **MediaPipe Tasks Vision** (Android): Apache License 2.0. The `com.google.mediapipe:tasks-vision` AAR, `ImageSegmenter` API. <https://github.com/google-ai-edge/mediapipe>.
- **MediaPipe Tasks Vision** (iOS): Apache License 2.0. The `MediaPipeTasksVision` CocoaPod, `ImageSegmenter` API. <https://github.com/google-ai-edge/mediapipe>.
- **MediaPipe Selfie Segmentation** (web): Apache License 2.0. The `@mediapipe/selfie_segmentation` Solution, loaded at runtime from `cdn.jsdelivr.net` (not bundled in this package). <https://github.com/google-ai-edge/mediapipe>.

### Bundled model

The native targets redistribute a TensorFlow Lite model inside the published package; it ships in `android/src/main/assets/selfie_segmenter.tflite` and in the iOS `Kaleidoscope.bundle`.

- **MediaPipe SelfieSegmenter** (`selfie_segmenter.tflite`): distributed by Google as part of MediaPipe Solutions.
  - Source: <https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite>
  - Model card: <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf>
  - The MediaPipe project and SDK are published by Google under the Apache License 2.0. The `selfie_segmenter.tflite` weights are redistributed here as published by Google as part of MediaPipe Solutions; Google does not attach a separate license to the hosted model file, so its use is governed by the model card above. The web target does not bundle this file; it fetches its model from the CDN at runtime.

## Algorithmic and architectural references

- **mrousavy/FaceBlurApp**: segmentation + GPU composite at 60–120 FPS. Different plumbing (camera-preview pipeline, not a WebRTC track), but the algorithmic shape of "mask + blurred copy + composite" is the same.
- **Volcomix/virtual-background**: TFLite WASM reference for the web blur composite.

## Trademarks

- "Apple", "Core Image", "Metal", and related Apple marks are trademarks of Apple Inc. Used here as nominative references only.
- "Google", "MediaPipe", and "TensorFlow Lite" are trademarks of Google LLC. Used here as nominative references only.
- "WebRTC" is a project of the W3C and IETF.

This package is not affiliated with, endorsed by, or certified by Apple, Google, the W3C, or the `react-native-webrtc` project.

## Forward-looking discipline

Effects added after v0.1 that depend on new third-party code or registered marks must:

1. Cite the source (with a stable URL and version) in the effect's source code.
2. Add an attribution section to this document.
3. Disclaim affiliation, endorsement, or certification where appropriate.
4. Treat trademarked names as **nominative references** only.
