import { afterEach, describe, expect, test } from 'bun:test';
import { maskSmoothstepRange, setMaskTuning, tuning } from '../tuning';

describe('maskSmoothstepRange', () => {
  test('centers the range on the threshold', () => {
    const [lo, hi] = maskSmoothstepRange(0.5, 0.7);
    expect((lo + hi) / 2).toBeCloseTo(0.7, 6);
  });

  test('lo is always below hi', () => {
    for (const hardness of [0, 0.25, 0.5, 0.75, 1]) {
      const [lo, hi] = maskSmoothstepRange(hardness, 0.5);
      expect(lo).toBeLessThan(hi);
    }
  });

  test('hardness 1 is near-step (narrow); hardness 0 is a wide halo', () => {
    const [lo0, hi0] = maskSmoothstepRange(0, 0.5);
    const [lo1, hi1] = maskSmoothstepRange(1, 0.5);
    expect(hi0 - lo0).toBeGreaterThan(hi1 - lo1);
    expect(hi0 - lo0).toBeCloseTo(0.62, 6);
    expect(hi1 - lo1).toBeCloseTo(0.02, 6);
  });

  test('clamps out-of-range hardness and threshold', () => {
    const [lo, hi] = maskSmoothstepRange(5, 9);
    expect((lo + hi) / 2).toBeCloseTo(0.95, 6); // threshold clamped to 0.95
    expect(hi - lo).toBeCloseTo(0.02, 6); // hardness clamped to 1
  });
});

describe('tuning singleton', () => {
  afterEach(() => {
    tuning.reset();
  });

  test('has library defaults', () => {
    expect(tuning.blurSigma).toBe(5);
    expect(tuning.maskHardness).toBe(0.5);
    expect(tuning.maskThreshold).toBe(0.5);
    expect(tuning.segmentationTargetShortSide).toBe(384);
    expect(tuning.debugTiming).toBe(false);
  });

  test('setBlurSigma clamps to [0.5, 7]', () => {
    tuning.setBlurSigma(1000);
    expect(tuning.blurSigma).toBe(7);
    tuning.setBlurSigma(0);
    expect(tuning.blurSigma).toBe(0.5);
    tuning.setBlurSigma(4);
    expect(tuning.blurSigma).toBe(4);
  });

  test('setMaskHardness clamps to [0, 1]', () => {
    tuning.setMaskHardness(2);
    expect(tuning.maskHardness).toBe(1);
    tuning.setMaskHardness(-1);
    expect(tuning.maskHardness).toBe(0);
  });

  test('setMaskThreshold clamps to [0.05, 0.95]', () => {
    tuning.setMaskThreshold(1);
    expect(tuning.maskThreshold).toBe(0.95);
    tuning.setMaskThreshold(0);
    expect(tuning.maskThreshold).toBe(0.05);
  });

  test('setSegmentationTargetShortSide clamps to [128, 1080]', () => {
    // The 128 floor must match the iOS and Android clamps so the same value
    // produces the same input resolution on every platform.
    tuning.setSegmentationTargetShortSide(9999);
    expect(tuning.segmentationTargetShortSide).toBe(1080);
    tuning.setSegmentationTargetShortSide(1);
    expect(tuning.segmentationTargetShortSide).toBe(128);
    tuning.setSegmentationTargetShortSide(512);
    expect(tuning.segmentationTargetShortSide).toBe(512);
  });

  test('setDebugTiming toggles the flag', () => {
    tuning.setDebugTiming(true);
    expect(tuning.debugTiming).toBe(true);
    tuning.setDebugTiming(false);
    expect(tuning.debugTiming).toBe(false);
  });

  test('setMaskTuning writes the page-shared mask edge (#47)', () => {
    // The processor-path twin of the binding's mask verb: no binding, no
    // pipeline, no instance; one call writes what every pipeline reads.
    setMaskTuning({ hardness: 0.2, threshold: 0.85 });
    expect(tuning.maskHardness).toBe(0.2);
    expect(tuning.maskThreshold).toBe(0.85);
  });

  test('setMaskTuning clamps to the mask verb ranges', () => {
    setMaskTuning({ hardness: 5, threshold: 2 });
    expect(tuning.maskHardness).toBe(1);
    expect(tuning.maskThreshold).toBe(0.95);
    setMaskTuning({ hardness: -1, threshold: -1 });
    expect(tuning.maskHardness).toBe(0);
    expect(tuning.maskThreshold).toBe(0.05);
  });

  test('reset restores defaults', () => {
    tuning.setBlurSigma(20);
    tuning.setMaskHardness(0.9);
    tuning.setMaskThreshold(0.8);
    tuning.setSegmentationTargetShortSide(720);
    tuning.setDebugTiming(true);
    tuning.reset();
    expect(tuning.blurSigma).toBe(5);
    expect(tuning.maskHardness).toBe(0.5);
    expect(tuning.maskThreshold).toBe(0.5);
    expect(tuning.segmentationTargetShortSide).toBe(384);
    expect(tuning.debugTiming).toBe(false);
  });
});
