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

        // The three numeric setters declare Double, not Float, even though the
        // EffectTuning fields are Float. JS Number is natively a 64-bit double;
        // ExpoModulesCore 1.12.26 on iOS bridges it cleanly to Swift Double but
        // hits an Optional-wrap bug on Float (CastingException<Float> at
        // DynamicRawType.swift:27 with 'Cannot cast Optional(0.6) to Float'),
        // because the JSI bridge produces an Optional<Float> that the
        // DynamicOptionalType wrapper does not unwrap before delegating to the
        // wrapped raw type. The same Function shape on Android works with Float.
        Function("setBlurSigma") { (value: Double) in
            EffectTuning.blurSigma = Float(value)
        }

        Function("setMaskHardness") { (value: Double) in
            EffectTuning.maskHardness = Float(value)
        }

        Function("setMaskThreshold") { (value: Double) in
            EffectTuning.maskThreshold = Float(value)
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
        Function("resolveImageUri") { (id: String) -> String? in
            BundledImage.bundledURL(for: id)?.absoluteString
        }

        // Segmentation perf control. A JS device-tier sets this to trade mask
        // resolution for cost on lower-end devices (e.g. A11/iPhone X). Double
        // and floor to Int for the same bridge-wrap reason as the Float setters
        // above; JS Number is a double, and the Double path through ExpoModules
        // does not hit the Optional<Float>-double-wrap bug.
        Function("setSegmentationTargetShortSide") { (value: Double) in
            EffectTuning.targetShortSide = Int(value)
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
