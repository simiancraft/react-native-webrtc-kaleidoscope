// Mutable runtime state for the web GLSL effects. Mirrors
// android/.../EffectTuning.kt and ios/.../EffectTuning.swift.
//
// `src/index.web.ts` exports setBlurSigma / setMaskHardness that write
// here; per-frame transforms in `src/web/effects/*.ts` read here when
// uploading uniforms. JS calls take effect on the next frame.

const clamp = (value: number, lo: number, hi: number): number => Math.min(Math.max(value, lo), hi);

class EffectTuningState {
  blurSigma = 8;
  maskHardness = 0.5;
  maskThreshold = 0.7;

  setBlurSigma(value: number): void {
    this.blurSigma = clamp(value, 0.5, 64);
  }

  setMaskHardness(value: number): void {
    this.maskHardness = clamp(value, 0, 1);
  }

  setMaskThreshold(value: number): void {
    this.maskThreshold = clamp(value, 0.05, 0.95);
  }

  reset(): void {
    this.blurSigma = 8;
    this.maskHardness = 0.5;
    this.maskThreshold = 0.7;
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
