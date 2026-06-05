// Mask smoothstep math, shared by every effect that composites with a mask.
// Two orthogonal controls: hardness governs the WIDTH of the transition,
// threshold governs the CENTER. Encapsulated so callers do not have to
// think about lo/hi pairs.

package com.simiancraft.kaleidoscope.segmentation

internal object MaskTuning {
    /**
     * Map a user-facing maskHardness in [0, 1] and maskThreshold in
     * [0.05, 0.95] to the (lo, hi) range the composite-subject / composite-masked
     * smoothstep should use over the raw confidence map.
     *
     * hardness controls width: 0.0 produces a soft halo (wide transition),
     * 1.0 produces a near-step edge (narrow transition).
     *
     * threshold controls the center: at threshold=0.5 the smoothstep is
     * centered on the confidence midpoint (neutral); higher values shift
     * the cutoff so only high-confidence pixels count as person (rejects
     * chair-edge low-confidence regions); lower values are more inclusive.
     *
     * Default (0.5, 0.5) yields (0.34, 0.66), close enough to the
     * historical (0.35, 0.65) hardcoded range that visuals are
     * indistinguishable.
     */
    fun smoothstepRange(
        hardness: Float,
        threshold: Float,
    ): Pair<Float, Float> {
        val clampedHardness = hardness.coerceIn(0f, 1f)
        val clampedThreshold = threshold.coerceIn(0.05f, 0.95f)
        val width = 0.6f * (1f - clampedHardness) + 0.02f
        val lo = clampedThreshold - width * 0.5f
        val hi = clampedThreshold + width * 0.5f
        return lo to hi
    }
}
