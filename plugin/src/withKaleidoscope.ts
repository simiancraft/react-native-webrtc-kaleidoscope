// Expo config plugin. Currently a passthrough; native registration happens
// via the Expo Module's OnCreate hook (see android/.../KaleidoscopeModule.kt
// and ios/.../KaleidoscopeModule.swift), not through a plugin-time mod.
//
// Substantive functionality would land here if we needed to:
//   - bundle background images into the consumer app outside the AAR
//     (withDangerousMod copying assets),
//   - inject build properties (minSdk, JVM target) that we cannot express
//     in our own android/build.gradle,
//   - write Info.plist privacy strings (react-native-webrtc handles these
//     today, so we do not duplicate).

import type { ConfigPlugin } from '@expo/config-plugins';

const withKaleidoscope: ConfigPlugin = (config) => config;

export default withKaleidoscope;
