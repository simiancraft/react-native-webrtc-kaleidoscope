// Mask smoothstep math, shared by every effect that composites with a mask.
// Direct port of android/.../segmentation/MaskTuning.kt.
//
// hardness controls the WIDTH of the smoothstep transition; threshold
// controls its CENTER. Both are read per frame from EffectTuning so JS tweaks
// take effect without re-registering processors. Returns the (lo, hi) range
// fed to composite.metal's uMaskLo / uMaskHi.

import Foundation

enum MaskTuning {
    /// Map maskHardness in [0, 1] and maskThreshold in [0.05, 0.95] to the
    /// (lo, hi) smoothstep range over the raw confidence mask. Defaults
    /// (0.5, 0.5) yield (0.34, 0.66), matching the Android and web sides.
    static func smoothstepRange(hardness: Float, threshold: Float) -> (lo: Float, hi: Float) {
        let clampedHardness = min(max(hardness, 0.0), 1.0)
        let clampedThreshold = min(max(threshold, 0.05), 0.95)
        let width = 0.6 * (1.0 - clampedHardness) + 0.02
        let lo = clampedThreshold - width * 0.5
        let hi = clampedThreshold + width * 0.5
        return (lo, hi)
    }
}
