// Expo Module entry point for react-native-webrtc-kaleidoscope on Android.
// Calls Registration.registerAll(context) at module init so frame-processor
// factories land in ProcessorProvider before any track requests them.
//
// Also exposes setBlurSigma / setMaskHardness / resetEffectTuning JS
// functions that mutate com.simiancraft.kaleidoscope.EffectTuning at
// runtime; the per-frame processors read those values each frame, so
// changes take effect without re-registering or rebuilding processors.
// This side-channels the upstream react-native-webrtc registry, which only
// accepts flat-string effect names; spec parameters flow through here.

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

    Function("setBlurSigma") { value: Float ->
      EffectTuning.blurSigma = value
    }

    Function("setMaskHardness") { value: Float ->
      EffectTuning.maskHardness = value
    }

    Function("setMaskThreshold") { value: Float ->
      EffectTuning.maskThreshold = value
    }

    Function("resetEffectTuning") {
      EffectTuning.reset()
    }
  }
}
