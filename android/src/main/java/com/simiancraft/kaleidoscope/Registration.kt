// Frame-processor registration for Android. Called from
// KaleidoscopeModule.OnCreate at Expo Module init time, before any track
// requests an effect by name. The Context is needed by GPU effects so they
// can read bundled assets: the background-image WebP presets and the
// selfie_segmenter.tflite model (loaded via SegmentationEngine).
//
// Registration is directory- and registry-driven, not hardcoded:
//   - background-image-<id> registers one BackgroundImageFactory per
//     <id>.webp the prebuild copied into assets/backgrounds/. The prebuild
//     curates that directory per consumer, so enumerating it registers exactly
//     the presets that ship; adding or dropping a preset needs no code change.
//   - the bare shader name (e.g. "plasma") registers one generic ShaderFactory
//     per entry in ShadersGenerated.GENERATIVE. Adding a generative .frag
//     (which regenerates GENERATIVE) registers with no code change here.
//   - blur and the four geometric transforms stay statically named.

package com.simiancraft.kaleidoscope

import android.content.Context
import android.util.Log
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.simiancraft.kaleidoscope.effects.BackgroundImageFactory
import com.simiancraft.kaleidoscope.effects.BlurFactory
import com.simiancraft.kaleidoscope.effects.ShaderFactory
import com.simiancraft.kaleidoscope.effects.TransformFactory
import com.simiancraft.kaleidoscope.gpu.Orientation
import com.simiancraft.kaleidoscope.gpu.ShadersGenerated

object Registration {
  private const val TAG = "Kaleidoscope.Registration"
  private const val BACKGROUNDS_DIR = "backgrounds"
  private const val WEBP_SUFFIX = ".webp"

  @JvmStatic
  fun registerAll(context: Context) {
    ProcessorProvider.addProcessor("blur", BlurFactory(context))

    // Geometric reorientation effects. flip-x is the corrected screen-horizontal
    // mirror (replaces the old "mirror" CPU effect). The rotation correction
    // lives entirely in Orientation.kt; each registration just names its op.
    ProcessorProvider.addProcessor("flip-x", TransformFactory(Orientation.Op.FLIP_X))
    ProcessorProvider.addProcessor("flip-y", TransformFactory(Orientation.Op.FLIP_Y))
    ProcessorProvider.addProcessor("rotate-cw", TransformFactory(Orientation.Op.ROTATE_CW))
    ProcessorProvider.addProcessor("rotate-ccw", TransformFactory(Orientation.Op.ROTATE_CCW))

    registerBackgroundImages(context)
    registerGenerativeShaders(context)
  }

  // Enumerate assets/backgrounds and register one BackgroundImageFactory per
  // <id>.webp. JS emits "background-image-<id>"; registering exactly the files
  // present is the point (the prebuild curates the directory). A missing or
  // empty directory is normal (a consumer that ships no presets) and must not
  // crash registration.
  private fun registerBackgroundImages(context: Context) {
    val entries = try {
      context.assets.list(BACKGROUNDS_DIR)
    } catch (t: Throwable) {
      Log.w(TAG, "could not list assets/$BACKGROUNDS_DIR; skipping background-image effects", t)
      null
    } ?: return

    for (entry in entries) {
      if (!entry.endsWith(WEBP_SUFFIX)) continue
      val id = entry.removeSuffix(WEBP_SUFFIX)
      ProcessorProvider.addProcessor(
        "background-image-$id",
        BackgroundImageFactory(context, id),
      )
    }
    Log.i(TAG, "registered ${entries.count { it.endsWith(WEBP_SUFFIX) }} background-image preset(s)")
  }

  // Register one generic ShaderFactory per generative shader in the codegen'd
  // registry. The effect name is the bare shader name (e.g. "plasma"); JS
  // targets its uniforms via setShaderUniforms(name, ...).
  private fun registerGenerativeShaders(context: Context) {
    for ((name, _) in ShadersGenerated.GENERATIVE) {
      ProcessorProvider.addProcessor(name, ShaderFactory(context, name))
    }
    Log.i(TAG, "registered ${ShadersGenerated.GENERATIVE.size} generative shader(s)")
  }
}
