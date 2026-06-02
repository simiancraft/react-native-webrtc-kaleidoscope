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

    // The three Float setters and the Int/Bool setters below accept Optional
    // and guard-unwrap. ExpoModulesCore 1.12.26 on iOS delivers JS-side
    // primitive arguments to the Function block as Optional even when the JS
    // call passes a real value (Android's expo-modules-core delivers raw); a
    // non-optional Swift signature throws CastingException<Float> at the
    // JavaScriptUtils.swift:40 unwrap. Same Function shape on Android
    // (`Float` non-nullable) works, so the asymmetry is on the iOS bridge.
    // A nil value silently no-ops the setter, matching Android's tolerance
    // for null in the same call path.
    Function("setBlurSigma") { (value: Float?) in
      guard let value = value else { return }
      EffectTuning.blurSigma = value
    }

    Function("setMaskHardness") { (value: Float?) in
      guard let value = value else { return }
      EffectTuning.maskHardness = value
    }

    Function("setMaskThreshold") { (value: Float?) in
      guard let value = value else { return }
      EffectTuning.maskThreshold = value
    }

    // Composite layer-stack channel. Mirrors android/.../KaleidoscopeModule.kt's
    // setCompositeLayers: JS sends the active composite's ordered layer stack as a
    // JSON string; CompositeLayers parses it into the snapshot the registered
    // "composite" CompositeProcessor composites each frame.
    Function("setCompositeLayers") { (json: String) in
      CompositeLayers.set(json)
    }

    // Resolve a displayable file:// URI for a bundled background by its book id,
    // for the picker's native thumbnails (react-native-webrtc-kaleidoscope/ui).
    // Returns nil when the asset isn't bundled, so the JS resolver falls back to
    // the source. Uses the same bundle lookup as an image layer, so
    // the thumbnail and the rendered background resolve to the same file.
    Function("resolveBackgroundUri") { (id: String) -> String? in
      BundledImage.bundledURL(for: id)?.absoluteString
    }

    // Segmentation perf control. A JS device-tier sets this to trade mask
    // resolution for cost on lower-end devices (e.g. A11/iPhone X).
    // Optional-typed param for the same iOS bridge-wrap reason as the Float
    // setters above.
    Function("setSegmentationTargetShortSide") { (value: Int?) in
      guard let value = value else { return }
      EffectTuning.targetShortSide = value
    }

    // Native perf instrument toggle; logs GPU/segmentation/ingest timings under
    // the os_log "Perf" category. Off by default.
    Function("setDebugTiming") { (value: Bool?) in
      guard let value = value else { return }
      EffectTuning.debugTiming = value
    }

    Function("resetEffectTuning") {
      EffectTuning.reset()
    }
  }
}
