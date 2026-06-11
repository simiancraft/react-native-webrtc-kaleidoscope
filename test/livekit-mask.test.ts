// Behavioral tests for the /livekit subpath's first-class mask surface (#47).
//
// setMaskTuning is the processor-path twin of the binding's mask verb: it
// writes the page-shared tuning singleton the running composite reads each
// frame. These tests pin (1) that the export exists on the subpath, (2) that it
// writes the SAME singleton the mask verb writes (the shared-semantics
// contract the issue asked to make first-class), and (3) that it clamps to the
// mask verb's ranges.

import { afterEach, describe, expect, test } from 'bun:test';
import { KaleidoscopeProcessor, setMaskTuning } from '../src/livekit';
import { tuning } from '../web-driver/tuning';

afterEach(() => {
  tuning.reset();
});

describe('setMaskTuning (livekit subpath)', () => {
  test('writes the page-shared mask edge', () => {
    setMaskTuning({ hardness: 0.2, threshold: 0.85 });
    expect(tuning.maskHardness).toBe(0.2);
    expect(tuning.maskThreshold).toBe(0.85);
  });

  test('clamps to the mask verb ranges (hardness 0..1, threshold 0.05..0.95)', () => {
    setMaskTuning({ hardness: 5, threshold: 2 });
    expect(tuning.maskHardness).toBe(1);
    expect(tuning.maskThreshold).toBe(0.95);
    setMaskTuning({ hardness: -1, threshold: -1 });
    expect(tuning.maskHardness).toBe(0);
    expect(tuning.maskThreshold).toBe(0.05);
  });

  test('needs no processor instance and no pipeline', () => {
    // The whole point of #47: mask tuning must not require constructing a
    // side binding (or any pipeline). A bare module-level call works.
    expect(typeof setMaskTuning).toBe('function');
    setMaskTuning({ hardness: 0.7, threshold: 0.6 });
    expect(tuning.maskHardness).toBe(0.7);
    expect(tuning.maskThreshold).toBe(0.6);
  });
});

describe('KaleidoscopeProcessor export (regression)', () => {
  test('still exports the processor class alongside the mask surface', () => {
    expect(typeof KaleidoscopeProcessor).toBe('function');
    const processor = new KaleidoscopeProcessor(['flip-x']);
    expect(processor.name).toBe('kaleidoscope');
  });
});
