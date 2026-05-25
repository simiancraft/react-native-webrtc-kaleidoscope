// Mutable runtime parameters for the GLSL effects on Android. The Expo
// Module's setBlurSigma / setMaskHardness JS functions update these values;
// per-frame processors read them on every frame so changes take effect
// without re-registering processors.
//
// This is the parameter-passing side-channel that lets us tune effect
// uniforms without touching the upstream react-native-webrtc registry,
// which only accepts flat-string effect names. The web side mirrors this
// shape in src/web/tuning.ts; iOS mirrors it in
// ios/KaleidoscopeModule/EffectTuning.swift.

package com.simiancraft.kaleidoscope

internal object EffectTuning {
  /**
   * Gaussian sigma for the blur effect; higher = softer blur. Default 5;
   * clamped to [0.5, 7] (the useful range before the linear-sampled kernel
   * truncates and bands). Setting the property is the public mutation API.
   */
  @Volatile
  var blurSigma: Float = 5f
    set(value) {
      field = value.coerceIn(0.5f, 7f)
    }

  /**
   * Mask smoothstep hardness for blur and background-image composites,
   * in [0, 1]; 0 = soft halo, 1 = near-step. Default reproduces the
   * historical smoothstep(0.34, 0.66) edge.
   */
  @Volatile
  var maskHardness: Float = 0.5f
    set(value) {
      field = value.coerceIn(0f, 1f)
    }

  /**
   * Mask smoothstep center for blur and background-image composites,
   * in [0, 1]; the threshold at which a pixel's raw confidence flips from
   * "background" to "person". Default 0.7 (dialed in post-optimization).
   * Higher values reject
   * low-confidence edges (chair backs, hair flyaway); lower values are
   * more inclusive. Clamped to a workable range below to keep the
   * smoothstep transition non-degenerate.
   */
  @Volatile
  var maskThreshold: Float = 0.7f
    set(value) {
      field = value.coerceIn(0.05f, 0.95f)
    }

  /**
   * Debug GPU timing. When true, the GLES effect factories log per-frame
   * GPU-completion latency under the "Perf" logcat tag (read a frame late via
   * the frame-pipeline fence). Off by default; toggled from JS via the Expo
   * Module's setDebugTiming so a tester can capture ground-truth numbers on a
   * device build without rebuilding. Mirrors the iOS timing flag being added
   * in parallel.
   */
  @Volatile
  var debugTiming: Boolean = false
    set(value) {
      field = value
    }

  /**
   * Segmentation input short-side (px). The mask is produced from an input
   * downscaled to this; lower = cheaper segmentation, softer mask edge.
   * Default 384; clamped [128, 1080]. Tuned live from JS via
   * setSegmentationTargetShortSide. (iOS mirrors this with a 384 default.)
   * Raised from 256: 256 fed MLKit too few pixels and dropped arms/torso.
   */
  @Volatile
  var targetShortSide: Int = 384
    set(value) {
      field = value.coerceIn(128, 1080)
    }

  fun reset() {
    blurSigma = 5f
    maskHardness = 0.5f
    maskThreshold = 0.7f
    debugTiming = false
    targetShortSide = 384
  }
}
