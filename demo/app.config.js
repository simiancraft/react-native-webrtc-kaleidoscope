// Plain CommonJS on purpose. EAS Build reads the app config with a Node-based
// reader (its own bundled @expo/config on the build worker) that does not
// transform TypeScript or ESM the way the local bun-driven CLI does; an
// app.config.ts with `import` syntax fails there with "Cannot use import
// statement outside a module". A CJS module.exports config needs no transform
// and is read identically by every tool, local or on EAS.

// Build identity surfaced on the demo screen so a tester can confirm exactly
// which commit a device is running (kills the "is this build stale?" doubt).
// EAS sets EAS_BUILD_GIT_COMMIT_HASH on the worker; locally we shell out to git.
// builtAt is evaluated when the config is read, which on EAS is build time.
const gitSha =
  process.env.EAS_BUILD_GIT_COMMIT_HASH ||
  (() => {
    try {
      return require('node:child_process').execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      return 'local';
    }
  })();
const builtAt = new Date().toISOString();

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'Kaleidoscope Demo',
  slug: 'react-native-webrtc-kaleidoscope-demo',
  owner: 'simiancraft',
  // Bump the patch on every EAS build so the on-screen version changes per build.
  version: '0.1.2',
  orientation: 'portrait',
  scheme: 'kaleidoscope-demo',
  userInterfaceStyle: 'automatic',
  updates: {
    url: 'https://u.expo.dev/9fe25758-9912-408f-b8a6-7f0b6c15a5a0',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.simiancraft.kaleidoscope.demo',
    infoPlist: {
      NSCameraUsageDescription: 'Kaleidoscope demo uses your camera to apply mirror and blur effects locally.',
      NSMicrophoneUsageDescription: 'Required by react-native-webrtc; no audio is recorded or transmitted in this demo.',
      // The demo uses only standard, exemption-qualifying encryption (HTTPS,
      // WebRTC). Declaring this avoids the manual App Store Connect compliance
      // prompt that otherwise blocks internal testing.
      ITSAppUsesNonExemptEncryption: false,
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
        // The library's plugin raises Podfile.properties.json's
        // ios.deploymentTarget so the Pods platform is 15.0 (Apple Vision
        // person segmentation requires iOS 15+), but the consumer app
        // target's IPHONEOS_DEPLOYMENT_TARGET is set by Expo's prebuild
        // independently; without this expo-build-properties entry it stays
        // at the Expo default (13.4), and the iOS link step fails with
        // "compiling for iOS 13.4, but module 'Kaleidoscope' has a minimum
        // deployment target of iOS 15.0".
        ios: {
          deploymentTarget: '15.0',
        },
      },
    ],
    // Reference the plugin by its explicit app.plugin.js subpath rather than the
    // bare package name. Expo's plugin resolver resolves the bare name through
    // the package "." export (-> dist/index.js), which does not exist in this
    // monorepo demo (dist is a gitignored build artifact, and EAS never builds
    // the library; it consumes it via file:..). The subpath resolves through the
    // "./app.plugin.js" export, which needs no build, and the resolver treats a
    // one-slash module id as a direct file reference.
    'react-native-webrtc-kaleidoscope/app.plugin.js',
  ],
  extra: {
    eas: {
      projectId: '9fe25758-9912-408f-b8a6-7f0b6c15a5a0',
    },
    build: {
      gitSha,
      builtAt,
    },
  },
};

module.exports = config;
