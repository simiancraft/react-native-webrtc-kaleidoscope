// Expo Module entry point for react-native-webrtc-kaleidoscope on Android.
// Calls Registration.registerAll() at module init so frame-processor factories
// land in ProcessorProvider before any track requests them.
//
// Implementation lands in Commit 4 (and finalized in Commit 8 wiring) of
// bootstrap-and-ship-v0-1.md.

package com.simiancraft.kaleidoscope

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KaleidoscopeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RnWebrtcKaleidoscope")

    OnCreate {
      Registration.registerAll()
    }
  }
}
