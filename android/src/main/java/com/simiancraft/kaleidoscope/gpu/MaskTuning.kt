// Mask hardness math, shared by every effect that composites with a mask.
// Encapsulated as an object so callers do not have to think about the
// smoothstep range; they just pick a hardness in [0, 1].

package com.simiancraft.kaleidoscope.gpu

internal object MaskTuning {
  /**
   * Map a user-facing maskHardness in [0, 1] to the (lo, hi) range a
   * COMPOSITE_FRAG smoothstep should use over the raw confidence map.
   *
   * 0.0 produces a soft halo (wide transition); 1.0 produces a near-step
   * edge (narrow transition). Default 0.5 yields (0.34, 0.66), close
   * enough to the historical (0.35, 0.65) hardcoded range that visuals
   * are indistinguishable.
   */
  fun smoothstepRange(hardness: Float): Pair<Float, Float> {
    val clamped = hardness.coerceIn(0f, 1f)
    val width = 0.6f * (1f - clamped) + 0.02f
    val lo = 0.5f - width * 0.5f
    val hi = 0.5f + width * 0.5f
    return lo to hi
  }
}
