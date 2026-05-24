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

    // Segmentation perf control. A JS device-tier sets this to trade mask
    // resolution for cost on lower-end devices (e.g. A11/iPhone X).
    Function("setSegmentationTargetShortSide") { (value: Int) in
      EffectTuning.targetShortSide = value
    }

    // NOTE: segmentationQuality (Vision .fast/.balanced/.accurate) is NOT
    // bridged to JS yet; it stays at its .fast default (see EffectTuning +
    // Segmenter). When the device-tier lands, wire setSegmentationQuality
    // across ALL layers at once (the src/index.ts interface + both entry
    // exports + an Android Function + a web store), never iOS-only — a
    // half-bridged setter throws on the platform that lacks the native function.

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
