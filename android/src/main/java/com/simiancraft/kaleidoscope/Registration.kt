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
import org.json.JSONArray
import com.simiancraft.kaleidoscope.effects.BackgroundImageFactory
import com.simiancraft.kaleidoscope.effects.BlurFactory
import com.simiancraft.kaleidoscope.effects.SceneFactory
import com.simiancraft.kaleidoscope.effects.ShaderFactory
import com.simiancraft.kaleidoscope.effects.TransformFactory
import com.simiancraft.kaleidoscope.gpu.Orientation
import com.simiancraft.kaleidoscope.gpu.ShadersGenerated

object Registration {
  private const val TAG = "Kaleidoscope.Registration"
  private const val BACKGROUNDS_DIR = "backgrounds"
  private const val WEBP_SUFFIX = ".webp"
  // JSON array of bundled ids the prebuild writes alongside the WebPs (see
  // app.plugin.js copyAndroidBackgrounds). Read via assets.open(), never list().
  private const val BACKGROUNDS_MANIFEST = "kaleidoscope-backgrounds.json"

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

    // One scene compositor serves every scene; the active layer stack is data,
    // delivered from JS via setSceneLayers (see SceneLayers / KaleidoscopeModule).
    ProcessorProvider.addProcessor("scene", SceneFactory(context))
  }

  // Register one BackgroundImageFactory per curated background id. JS emits
  // "background-image-<id>"; registering exactly the bundled ids is the point
  // (the prebuild curates them). A missing/empty set is normal (a consumer that
  // ships no presets) and must not crash registration.
  private fun registerBackgroundImages(context: Context) {
    val ids = readBackgroundManifest(context) ?: listBackgroundIds(context)
    for (id in ids) {
      ProcessorProvider.addProcessor(
        "background-image-$id",
        BackgroundImageFactory(context, id),
      )
    }
    Log.i(TAG, "registered ${ids.size} background-image preset(s)")
  }

  // Primary discovery: the prebuild-written manifest (a JSON array of ids), read
  // via assets.open(). The curated set is known at prebuild time and written
  // explicitly (see app.plugin.js), so registration reads that list rather than
  // re-scanning the directory with assets.list(), whose reliability on
  // AAPT2-packaged release builds is not guaranteed. This also aligns Android
  // with iOS, which has always discovered from its manifest. Returns null when
  // the manifest is absent (an older prebuild) so the caller falls back to
  // enumeration.
  private fun readBackgroundManifest(context: Context): List<String>? =
    try {
      val json = context.assets
        .open("$BACKGROUNDS_DIR/$BACKGROUNDS_MANIFEST")
        .use { it.readBytes().toString(Charsets.UTF_8) }
      val arr = JSONArray(json)
      (0 until arr.length()).map { arr.getString(it) }
    } catch (t: Throwable) {
      Log.w(TAG, "no readable $BACKGROUNDS_MANIFEST; falling back to directory enumeration", t)
      null
    }

  // Fallback discovery for builds whose prebuild predates the manifest:
  // enumerate assets/backgrounds. Unreliable on real-device release packaging
  // (see readBackgroundManifest); kept only for backward compatibility.
  private fun listBackgroundIds(context: Context): List<String> {
    val entries = try {
      context.assets.list(BACKGROUNDS_DIR)
    } catch (t: Throwable) {
      Log.w(TAG, "could not list assets/$BACKGROUNDS_DIR; skipping background-image effects", t)
      null
    } ?: return emptyList()
    return entries.filter { it.endsWith(WEBP_SUFFIX) }.map { it.removeSuffix(WEBP_SUFFIX) }
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
