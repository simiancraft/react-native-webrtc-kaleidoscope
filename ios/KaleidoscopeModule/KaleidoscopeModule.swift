// Expo Module entry point for react-native-webrtc-kaleidoscope on iOS.
// Calls Registration.registerAll() at module init so frame processors land
// in ProcessorProvider before any track requests them. Mirrors the Android
// entry at android/.../KaleidoscopeModule.kt.

import ExpoModulesCore

public class KaleidoscopeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RnWebrtcKaleidoscope")

    OnCreate {
      Registration.registerAll()
    }

    Function("setBlurSigma") { (value: Float) in
      EffectTuning.blurSigma = value
    }

    Function("setMaskHardness") { (value: Float) in
      EffectTuning.maskHardness = value
    }

    Function("setMaskThreshold") { (value: Float) in
      EffectTuning.maskThreshold = value
    }

    Function("resetEffectTuning") {
      EffectTuning.reset()
    }
  }
}
