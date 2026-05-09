# Security policy

## Supported versions

Only the latest major receives security fixes. react-native-webrtc-kaleidoscope is pre-1.0; the `0.x` line on `main` is supported until v1.

| Version | Supported |
|---------|-----------|
| 0.x     | ✓         |

## Reporting a vulnerability

Report security issues **privately** via GitHub Security Advisories; open [a new advisory](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/security/advisories/new) on this repository. If that route is not available to you, email **info@simiancraft.com**.

Please do **not** open a public GitHub issue for security reports.

You should receive an acknowledgement within **3 business days**. We aim to ship a patch (or publish a mitigation plan) within **14 days** of a confirmed report.

## Scope

react-native-webrtc-kaleidoscope is a native Expo Module that registers video frame processors with `react-native-webrtc`. It runs inside the consuming app's process and operates on local media tracks. Realistic in-scope issues:

- **Memory safety** in native code paths (Kotlin/Swift) that handle decoded video frames; out-of-bounds reads, use-after-free, or buffer underflow on attacker-influenced frame dimensions.
- **Privacy regressions:** unintended logging, transmission, or persistence of camera frames or segmentation masks. Frames must never leave the device for non-network purposes; segmentation must run on-device.
- **Supply-chain** issues affecting the published package; compromised dev-dep, tampered release artifact, or typosquatting of the `react-native-webrtc-kaleidoscope` name.
- **Publish hygiene:** credentials, test fixtures, or unintended build artifacts shipped to npm.
- **Config-plugin injection** vectors; the plugin modifies `MainApplication`/`AppDelegate` at prebuild time and must reject untrusted user input that could land in those files.

### Out of scope

- **Bugs in `react-native-webrtc`** itself (the peer dependency). Report upstream at <https://github.com/react-native-webrtc/react-native-webrtc>.
- **Bugs in MLKit, MediaPipe, or Apple Vision** (the segmentation backends). Report to their respective maintainers.
- **Visual quality** of segmentation masks, or platform parity gaps between Apple Vision / MLKit / MediaPipe. These are tracked as regular [GitHub issues](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues).
- **Theoretical issues** that require an attacker to already control the local camera input pipeline.
