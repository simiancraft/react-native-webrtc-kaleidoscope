// Mutable runtime state for the web GLSL effects. Mirrors
// android/.../EffectTuning.kt and ios/.../EffectTuning.swift.
//
// There are no global set* exports anymore; the mask edge (hardness/threshold)
// is written here through the setMask closure that `bindKaleidoscope`
// (src/index.web.ts) wires up, and the composite compositor in
// `src/web/effects/*.ts` reads it when uploading uniforms. Writes take effect on
// the next frame.

const clamp = (value: number, lo: number, hi: number): number => Math.min(Math.max(value, lo), hi);

class EffectTuningState {
  blurSigma = 5;
  maskHardness = 0.5;
  maskThreshold = 0.5;
  // Native-only knobs stored here for cross-platform API parity; the web
  // MediaPipe pipeline does not currently consume them.
  segmentationTargetShortSide = 384;
  debugTiming = false;

  setBlurSigma(value: number): void {
    this.blurSigma = clamp(value, 0.5, 7);
  }

  setMaskHardness(value: number): void {
    this.maskHardness = clamp(value, 0, 1);
  }

  setMaskThreshold(value: number): void {
    this.maskThreshold = clamp(value, 0.05, 0.95);
  }

  setSegmentationTargetShortSide(value: number): void {
    this.segmentationTargetShortSide = clamp(value, 128, 1080);
  }

  setDebugTiming(value: boolean): void {
    this.debugTiming = value;
  }

  reset(): void {
    this.blurSigma = 5;
    this.maskHardness = 0.5;
    this.maskThreshold = 0.5;
    this.segmentationTargetShortSide = 384;
    this.debugTiming = false;
  }
}

export const tuning = new EffectTuningState();

/**
 * Derive a smoothstep (lo, hi) range from a hardness factor in [0, 1] and
 * a threshold in [0.05, 0.95]. Matches `MaskTuning.smoothstepRange` on the
 * Android side; keep in sync.
 *
 * hardness controls width: 0 = soft halo (wide transition), 1 = near-step.
 * threshold controls the center: 0.5 = neutral, higher = reject low-
 * confidence pixels (rejects chair-edge regions), lower = more inclusive.
 */
export const maskSmoothstepRange = (
  hardness: number,
  threshold: number,
): readonly [number, number] => {
  const clampedHardness = clamp(hardness, 0, 1);
  const clampedThreshold = clamp(threshold, 0.05, 0.95);
  const width = 0.6 * (1 - clampedHardness) + 0.02;
  return [clampedThreshold - width * 0.5, clampedThreshold + width * 0.5] as const;
};
