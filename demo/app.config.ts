import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Kaleidoscope Demo',
  slug: 'react-native-webrtc-kaleidoscope-demo',
  version: '0.0.0',
  orientation: 'portrait',
  scheme: 'kaleidoscope-demo',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.simiancraft.kaleidoscope.demo',
    infoPlist: {
      NSCameraUsageDescription: 'Kaleidoscope demo uses your camera to apply mirror and blur effects locally.',
      NSMicrophoneUsageDescription: 'Required by react-native-webrtc; no audio is recorded or transmitted in this demo.',
    },
  },
  android: {
    package: 'com.simiancraft.kaleidoscope.demo',
    permissions: ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS'],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  // For web export, only expo-router is needed. Native-only plugins
  // ('react-native-webrtc' has no config plugin upstream as of 124.0.7;
  // 'react-native-webrtc-kaleidoscope' is a passthrough until Commit 8)
  // would be re-added before `bunx expo prebuild`.
  plugins: ['expo-router'],
};

export default config;
