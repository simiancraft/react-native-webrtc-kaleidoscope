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

  setBlurSigma(value: number): void {
    this.blurSigma = clamp(value, 0.5, 64);
  }

  setMaskHardness(value: number): void {
    this.maskHardness = clamp(value, 0, 1);
  }

  reset(): void {
    this.blurSigma = 8;
    this.maskHardness = 0.5;
  }
}

export const tuning = new EffectTuningState();

/**
 * Derive a smoothstep (lo, hi) range from a hardness factor in [0, 1].
 * Matches `MaskTuning.smoothstepRange` on the Android side; keep in sync.
 * 0 = soft halo (wide transition), 1 = near-step edge.
 */
export const maskHardnessRange = (hardness: number): readonly [number, number] => {
  const clamped = clamp(hardness, 0, 1);
  const width = 0.6 * (1 - clamped) + 0.02;
  return [0.5 - width * 0.5, 0.5 + width * 0.5] as const;
};
