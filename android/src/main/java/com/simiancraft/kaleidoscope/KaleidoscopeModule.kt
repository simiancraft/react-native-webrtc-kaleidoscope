// Expo Module entry point for react-native-webrtc-kaleidoscope on Android.
// Calls Registration.registerAll(context) at module init so frame-processor
// factories land in ProcessorProvider before any track requests them.

package com.simiancraft.kaleidoscope

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KaleidoscopeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RnWebrtcKaleidoscope")

    OnCreate {
      val ctx = appContext.reactContext
        ?: error("Kaleidoscope: no react context at OnCreate; cannot register Android effects")
      Registration.registerAll(ctx)
    }
  }
}
