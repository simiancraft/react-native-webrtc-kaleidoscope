// Plain CommonJS on purpose. EAS Build reads the app config with a Node-based
// reader (its own bundled @expo/config on the build worker) that does not
// transform TypeScript or ESM the way the local bun-driven CLI does; an
// app.config.ts with `import` syntax fails there with "Cannot use import
// statement outside a module". A CJS module.exports config needs no transform
// and is read identically by every tool, local or on EAS.

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'Kaleidoscope Demo',
  slug: 'react-native-webrtc-kaleidoscope-demo',
  owner: 'simiancraft',
  version: '0.0.0',
  orientation: 'portrait',
  scheme: 'kaleidoscope-demo',
  userInterfaceStyle: 'automatic',
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
    // No favicon shipped with v0.1; referencing a path here makes Expo's
    // FaviconMiddleware throw ENOENT when assets/ exists but the file does not.
  },
  // For web export, only expo-router is needed. react-native-webrtc has
  // no config plugin upstream as of 124.0.7. react-native-webrtc-kaleidoscope's
  // plugin patches the iOS Podfile so react-native-webrtc builds with modular
  // headers, which our Swift `import react_native_webrtc` requires.
  plugins: [
    'expo-router',
    // react-native-webrtc requires Android API 24+; without this, prebuild
    // emits minSdkVersion=23 and the manifest merger rejects the AAR.
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 24,
        },
      },
    ],
    // Resolves via demo/node_modules/react-native-webrtc-kaleidoscope -> ../..
    // to the repo root app.plugin.js, which performs the iOS Podfile patch.
    'react-native-webrtc-kaleidoscope',
  ],
  extra: {
    eas: {
      projectId: '9fe25758-9912-408f-b8a6-7f0b6c15a5a0',
    },
  },
};

module.exports = config;
