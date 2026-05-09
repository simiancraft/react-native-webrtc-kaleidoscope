// Expo config plugin: injects native registration calls into MainApplication
// (Android) and AppDelegate (iOS) at prebuild time.
//
// Implementation lands in Commit 8 of bootstrap-and-ship-v0-1.md.

import type { ConfigPlugin } from '@expo/config-plugins';

const withKaleidoscope: ConfigPlugin = (config) => {
  // TODO(Commit 8):
  //   - withMainApplication: import com.simiancraft.kaleidoscope.Registration;
  //                           call Registration.registerAll() inside onCreate.
  //   - withAppDelegate:     import header; call [KaleidoscopeRegistration registerAll]
  //                           (or Swift bridge equivalent) inside
  //                           application:didFinishLaunchingWithOptions:.
  return config;
};

export default withKaleidoscope;
