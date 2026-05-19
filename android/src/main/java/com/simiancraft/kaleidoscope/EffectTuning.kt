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
   * Gaussian sigma for the blur effect; higher = softer blur. Default
   * matches the v0.1 hardcoded value. Custom setter clamps to a sane
   * range; setting the property is the public mutation API.
   */
  @Volatile
  var blurSigma: Float = 8f
    set(value) {
      field = value.coerceIn(0.5f, 64f)
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
   * "background" to "person". Default 0.5 reproduces the historical
   * smoothstep centered on the confidence midpoint. Higher values reject
   * low-confidence edges (chair backs, hair flyaway); lower values are
   * more inclusive. Clamped to a workable range below to keep the
   * smoothstep transition non-degenerate.
   */
  @Volatile
  var maskThreshold: Float = 0.5f
    set(value) {
      field = value.coerceIn(0.05f, 0.95f)
    }

  fun reset() {
    blurSigma = 8f
    maskHardness = 0.5f
    maskThreshold = 0.5f
  }
}
