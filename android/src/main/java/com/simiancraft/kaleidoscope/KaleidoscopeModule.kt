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
  // Application context captured at OnCreate. resolveBackgroundUri uses this
  // instead of the lazy appContext.reactContext (which can be transiently null
  // at call time) so the thumbnail existence check is as robust as the
  // composite factory, which holds its own captured context.
  private var assetContext: android.content.Context? = null

  override fun definition() = ModuleDefinition {
    Name("RnWebrtcKaleidoscope")

    OnCreate {
      val ctx = appContext.reactContext
        ?: error("Kaleidoscope: no react context at OnCreate; cannot register Android effects")
      assetContext = ctx.applicationContext
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

    // Composite layer-stack channel. JS serializes the active composite's ordered
    // layer stack (shader, target, blend, image source id, uniforms) to a JSON
    // string; CompositeLayers parses it once and the single registered "composite"
    // processor composites whatever stack is current. Delivering it as a
    // side-channel keeps the upstream registry's flat-string contract intact:
    // "composite" is one registered name whose contents JS swaps; the per-layer
    // uniforms ride inside that same payload.
    Function("setCompositeLayers") { json: String ->
      CompositeLayers.set(json)
    }

    // Resolve a displayable URI for a bundled composite image by its book id, for
    // the picker's native thumbnails (react-native-webrtc-kaleidoscope/ui). The
    // prebuild copies every referenced WebP into assets/images/<id>.webp
    // (app.plugin.js, the same images the compositor reads); return Fresco's
    // `asset://` URI when present, else null so the JS resolver falls back to the
    // source.
    //
    // Must be `asset:///` (Fresco's LocalAssetFetchProducer reads it through the
    // AssetManager), NOT `file:///android_asset/...`: the latter routes to Fresco's
    // local-file fetcher, which opens a real FileInputStream on the virtual
    // `/android_asset` path and fails silently, leaving the tile blank. The
    // background-replace effect reads the same asset via assets.open() directly,
    // which is why the full background renders while the thumbnail did not.
    Function("resolveBackgroundUri") { id: String ->
      // Device-robust existence check. Two independent device-vs-emulator hazards
      // both left library thumbnails blank on hardware while the emulator looked
      // fine, so guard against both:
      //  - method: assets.open(), NOT assets.list(). AssetManager.list() returns
      //    empty on real-device AAPT2 release packaging even when the asset is
      //    present; open() works (the image layer / composite path uses open()
      //    and loads on device).
      //  - context: the captured applicationContext, NOT the lazy
      //    appContext.reactContext, which can be transiently null at call time.
      val ctx = assetContext ?: appContext.reactContext?.applicationContext
      val present = try {
        ctx?.assets?.open("images/$id.webp")?.use { true } == true
      } catch (t: Throwable) {
        false
      }
      if (present) "asset:///images/$id.webp" else null
    }

    Function("setDebugTiming") { value: Boolean ->
      EffectTuning.debugTiming = value
    }

    Function("setSegmentationTargetShortSide") { value: Int ->
      EffectTuning.targetShortSide = value
    }

    Function("resetEffectTuning") {
      EffectTuning.reset()
    }
  }
}
