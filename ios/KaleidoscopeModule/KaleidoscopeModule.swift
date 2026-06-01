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

    // Generic shader uniform channel (#32). JS sends a flat record of
    // name -> (number | number[]); ShaderUniforms normalizes each value to a
    // [Float] and the generic ShaderProcessor binds them by name each frame. The
    // record arrives as [String: Any] across the Expo bridge (numbers as Double/
    // NSNumber, arrays as [Any] of NSNumber); ShaderUniforms.set handles the
    // coercion. Mirrors android/.../KaleidoscopeModule.kt's setShaderUniforms.
    Function("setShaderUniforms") { (name: String, uniforms: [String: Any]) in
      ShaderUniforms.set(name: name, uniforms: uniforms)
    }

    // Scene layer-stack channel. Mirrors android/.../KaleidoscopeModule.kt's
    // setSceneLayers: JS sends the active scene's ordered layer stack as a JSON
    // string; SceneLayers parses it into the snapshot the registered "scene"
    // SceneProcessor composites each frame.
    Function("setSceneLayers") { (json: String) in
      SceneLayers.set(json)
    }

    // Resolve a displayable file:// URI for a bundled background by its book id,
    // for the picker's native thumbnails (react-native-webrtc-kaleidoscope/ui).
    // Returns nil when the asset isn't bundled, so the JS resolver falls back to
    // the source. Uses the same bundle lookup as the background-image effect, so
    // the thumbnail and the rendered background resolve to the same file.
    Function("resolveBackgroundUri") { (id: String) -> String? in
      BackgroundImageProcessor.bundledURL(for: id)?.absoluteString
    }

    // Segmentation perf control. A JS device-tier sets this to trade mask
    // resolution for cost on lower-end devices (e.g. A11/iPhone X).
    Function("setSegmentationTargetShortSide") { (value: Int) in
      EffectTuning.targetShortSide = value
    }

    // Native perf instrument toggle; logs GPU/segmentation/ingest timings under
    // the os_log "Perf" category. Off by default.
    Function("setDebugTiming") { (value: Bool) in
      EffectTuning.debugTiming = value
    }

    Function("resetEffectTuning") {
      EffectTuning.reset()
    }
  }
}
