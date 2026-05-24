import { describe, expect, test } from 'bun:test';
import { computeBlurKernel, KERNEL_TAPS } from '../src/web/blur-kernel';

describe('computeBlurKernel', () => {
  test('produces KERNEL_TAPS weights and offsets', () => {
    const { weights, offsets } = computeBlurKernel(8);
    expect(weights.length).toBe(KERNEL_TAPS);
    expect(offsets.length).toBe(KERNEL_TAPS);
  });

  test('offsets are evenly spaced by 2 pixels', () => {
    const { offsets } = computeBlurKernel(8);
    for (let i = 0; i < KERNEL_TAPS; i++) {
      expect(offsets[i]).toBe(i * 2);
    }
  });

  test('weights normalize to 1 (center once + each side tap twice)', () => {
    const { weights } = computeBlurKernel(8);
    let sum = weights[0] ?? 0;
    for (let i = 1; i < KERNEL_TAPS; i++) {
      sum += 2 * (weights[i] ?? 0);
    }
    expect(sum).toBeCloseTo(1, 6);
  });

  test('center tap is heaviest; weights decrease monotonically', () => {
    const { weights } = computeBlurKernel(8);
    expect(weights[0] ?? 0).toBeGreaterThan(0);
    for (let i = 1; i < KERNEL_TAPS; i++) {
      expect(weights[i] ?? 0).toBeLessThanOrEqual(weights[i - 1] ?? 0);
    }
  });

  test('larger sigma spreads weight outward (lower center weight)', () => {
    const tight = computeBlurKernel(2);
    const wide = computeBlurKernel(32);
    expect(wide.weights[0] ?? 0).toBeLessThan(tight.weights[0] ?? 1);
  });

  test('all weights are finite and non-negative', () => {
    const { weights } = computeBlurKernel(8);
    for (const w of weights) {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  test('returns fresh arrays each call (no shared mutable state)', () => {
    const a = computeBlurKernel(8);
    const b = computeBlurKernel(8);
    expect(a.weights).not.toBe(b.weights);
    expect(Array.from(a.weights)).toEqual(Array.from(b.weights));
  });
});
