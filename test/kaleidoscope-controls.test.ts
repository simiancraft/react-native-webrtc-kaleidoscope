// Behavioral tests for the three-verb composite state machine (createControls).
//
// createControls is the platform-agnostic core of the kaleidoscope() surface:
// it holds the active art composite + the transform-op list, reconciles them
// into an ordered EffectSpec array, and routes uniform patches through either a
// rebuild or the live no-rebuild channel. Every platform side effect is
// injected (reconcile / setMask / setLayerUniforms / resetLayerUniforms), so the
// whole machine is exercised here with spies and no DOM/GL/native bridge.

import { describe, expect, test } from 'bun:test';
import { createControls } from '../src/kaleidoscope/controls';
import type { KaleidoscopePreset, KaleidoscopePresetBook } from '../src/kaleidoscope/types';
import type { EffectSpec } from '../src/types';

// --- Fixtures -------------------------------------------------------------

// Distinct fake tracks; identity is all the machine cares about.
const baseTrack = { id: 'base' } as unknown as MediaStreamTrack;

const aurora: KaleidoscopePreset = {
  name: 'Aurora',
  taxonomy: ['Backgrounds'],
  layers: [
    { id: 'sky', shader: 'image', source: 'aurora' },
    { id: 'glow', shader: 'plasma', uniforms: { uSpeed: 0.5 } },
    { id: 'haze', shader: 'clouds', uniforms: { uExposure: 1 } },
  ],
};

const blurOnly: KaleidoscopePreset = {
  name: 'Soft Blur',
  taxonomy: ['Camera'],
  layers: [{ id: 'blur', shader: 'blur', uniforms: { sigma: 3 } }],
};

const presets = { aurora, blur: blurOnly } as const satisfies KaleidoscopePresetBook;

// A reconcile spy: records every spec array it applied, and hands back a fresh
// track per call so the `track` getter / onTrack plumbing is observable.
const makeHarness = () => {
  const applied: EffectSpec[][] = [];
  const tracks: MediaStreamTrack[] = [];
  const setMaskCalls: Array<[number, number]> = [];
  const setLayerCalls: Array<[string, Record<string, number | readonly number[]>]> = [];
  const onTrackCalls: MediaStreamTrack[] = [];
  let resetCount = 0;
  let disposed = 0;

  const reconcile = {
    apply: (specs: ReadonlyArray<EffectSpec>) => {
      applied.push([...specs]);
      const t = { id: `out-${applied.length}` } as unknown as MediaStreamTrack;
      tracks.push(t);
      return t;
    },
    dispose: () => {
      disposed += 1;
    },
  };

  const controls = createControls(
    baseTrack,
    { presets, onTrack: (t) => onTrackCalls.push(t) },
    reconcile,
    (h, t) => setMaskCalls.push([h, t]),
    (id, u) => setLayerCalls.push([id, u as Record<string, number | readonly number[]>]),
    () => {
      resetCount += 1;
    },
  );

  return {
    controls,
    applied,
    tracks,
    setMaskCalls,
    setLayerCalls,
    onTrackCalls,
    get resetCount() {
      return resetCount;
    },
    get disposed() {
      return disposed;
    },
  };
};

// --- Initial state --------------------------------------------------------

describe('createControls initial state', () => {
  test('starts on the base track and applies nothing until commanded', () => {
    const h = makeHarness();
    expect(h.controls.track).toBe(baseTrack);
    expect(h.applied).toHaveLength(0);
    expect(h.onTrackCalls).toHaveLength(0);
  });
});

// --- The art verb (kaleidoscope) ------------------------------------------

describe('kaleidoscope (art verb)', () => {
  test('selecting a preset reconciles its composite and yields a new track', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    expect(h.applied).toEqual([[{ name: 'composite', layers: aurora.layers }]]);
    const firstOut = h.tracks[0];
    expect(h.controls.track).toBe(firstOut as MediaStreamTrack);
    expect(h.onTrackCalls).toEqual([firstOut as MediaStreamTrack]);
  });

  test('a preset switch drops live overrides first (resetLayerUniforms)', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    h.controls.kaleidoscope('blur');
    expect(h.resetCount).toBe(2);
    expect(h.applied[1]).toEqual([{ name: 'composite', layers: blurOnly.layers }]);
  });

  test('clearing with null removes the art layer but still applies', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    h.controls.kaleidoscope(null);
    expect(h.applied[1]).toEqual([]);
    expect(h.resetCount).toBe(2);
  });
});

// --- Patch routing: live channel vs rebuild -------------------------------

describe('kaleidoscope patch routing', () => {
  test('patching the ACTIVE preset routes through the live channel, no rebuild', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    const appliedBefore = h.applied.length;
    h.controls.kaleidoscope('aurora', [{ id: 'glow', uniforms: { uSpeed: 0.9 } }]);
    expect(h.setLayerCalls).toEqual([['glow', { uSpeed: 0.9 }]]);
    expect(h.applied).toHaveLength(appliedBefore); // no extra reconcile
    expect(h.resetCount).toBe(1); // not reset again
  });

  test('multiple patches in one call each write the live channel', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    h.controls.kaleidoscope('aurora', [
      { id: 'glow', uniforms: { uSpeed: 0.2 } },
      { id: 'haze', uniforms: { uExposure: 0.1 } },
    ]);
    expect(h.setLayerCalls).toEqual([
      ['glow', { uSpeed: 0.2 }],
      ['haze', { uExposure: 0.1 }],
    ]);
  });

  test('patching a DIFFERENT preset rebuilds (switch wins over patch)', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    h.controls.kaleidoscope('blur', [{ id: 'blur', uniforms: { sigma: 5 } }]);
    expect(h.setLayerCalls).toHaveLength(0);
    expect(h.applied[1]).toEqual([{ name: 'composite', layers: blurOnly.layers }]);
  });

  test('an empty patch array on the active preset falls through to a rebuild', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    h.controls.kaleidoscope('aurora', []);
    expect(h.setLayerCalls).toHaveLength(0);
    expect(h.applied).toHaveLength(2);
  });

  test('patches before any preset is active rebuild rather than route', () => {
    const h = makeHarness();
    // cmd === activeId would be null === null, but the live-channel guard also
    // requires cmd != null, so a null command with patches still rebuilds (art
    // stays null -> empty apply). The public types forbid patches alongside a
    // null cmd, so this out-of-contract call routes through a loosened view to
    // exercise the runtime guard directly.
    const loose = h.controls.kaleidoscope as (
      cmd: null,
      patches: ReadonlyArray<{ id: string; uniforms: Record<string, number> }>,
    ) => void;
    loose(null, [{ id: 'x', uniforms: { a: 1 } }]);
    expect(h.setLayerCalls).toHaveLength(0);
    expect(h.applied).toEqual([[]]);
  });
});

// --- The transform verb ---------------------------------------------------

describe('transform (geometry verb)', () => {
  const opsFor = (h: ReturnType<typeof makeHarness>) => h.applied[h.applied.length - 1];

  test('decomposes 90/180/270 into the discrete rotate ops', () => {
    const cases: Array<[number, EffectSpec[]]> = [
      [90, [{ name: 'rotate-cw' }]],
      [180, [{ name: 'rotate-cw' }, { name: 'rotate-cw' }]],
      [270, [{ name: 'rotate-ccw' }]],
      [360, []],
      [0, []],
    ];
    for (const [deg, expected] of cases) {
      const h = makeHarness();
      h.controls.transform({ rotate: deg });
      expect(opsFor(h)).toEqual(expected);
    }
  });

  test('snaps near-angles to the nearest 90 and normalizes negatives', () => {
    const h1 = makeHarness();
    h1.controls.transform({ rotate: 44 });
    expect(opsFor(h1)).toEqual([]); // rounds to 0
    const h2 = makeHarness();
    h2.controls.transform({ rotate: 46 });
    expect(opsFor(h2)).toEqual([{ name: 'rotate-cw' }]); // rounds to 90
    const h3 = makeHarness();
    h3.controls.transform({ rotate: -90 });
    expect(opsFor(h3)).toEqual([{ name: 'rotate-ccw' }]); // normalizes to 270
  });

  test('flips emit before rotation', () => {
    const h = makeHarness();
    h.controls.transform({ flip: { x: true, y: true }, rotate: 90 });
    expect(opsFor(h)).toEqual([{ name: 'flip-x' }, { name: 'flip-y' }, { name: 'rotate-cw' }]);
  });

  test('no-arg transform resets geometry to identity', () => {
    const h = makeHarness();
    h.controls.transform({ rotate: 90 });
    h.controls.transform();
    expect(opsFor(h)).toEqual([]);
  });

  test('art stays first, transform ops stay last when both are set', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    h.controls.transform({ rotate: 90 });
    expect(opsFor(h)).toEqual([
      { name: 'composite', layers: aurora.layers },
      { name: 'rotate-cw' },
    ]);
  });

  test('a transform of the active preset does NOT reset live overrides', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    const resetBefore = h.resetCount;
    h.controls.transform({ rotate: 180 });
    expect(h.resetCount).toBe(resetBefore); // slider tweaks survive a flip/rotate
  });
});

// --- The mask verb --------------------------------------------------------

describe('mask (segmentation edge)', () => {
  test('writes the edge channel without rebuilding the pipeline', () => {
    const h = makeHarness();
    h.controls.kaleidoscope('aurora');
    const appliedBefore = h.applied.length;
    h.controls.mask({ hardness: 0.2, threshold: 0.85 });
    expect(h.setMaskCalls).toEqual([[0.2, 0.85]]);
    expect(h.applied).toHaveLength(appliedBefore);
  });
});

// --- Teardown -------------------------------------------------------------

describe('dispose', () => {
  test('delegates to the injected reconcile.dispose', () => {
    const h = makeHarness();
    h.controls.dispose();
    expect(h.disposed).toBe(1);
  });
});
