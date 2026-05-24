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

    // Segmentation perf controls. A JS device-tier sets these to trade mask
    // quality for cost on lower-end devices (e.g. A11/iPhone X).
    Function("setSegmentationTargetShortSide") { (value: Int) in
      EffectTuning.targetShortSide = value
    }

    Function("setSegmentationQuality") { (value: String) in
      EffectTuning.segmentationQuality = SegmentationQuality.from(value)
    }

    // Native perf instrument toggle; logs GPU/Vision/ingest timings under the
    // os_log "Perf" category. Off by default.
    Function("setDebugTiming") { (value: Bool) in
      EffectTuning.debugTiming = value
    }

    Function("resetEffectTuning") {
      EffectTuning.reset()
    }
  }
}
