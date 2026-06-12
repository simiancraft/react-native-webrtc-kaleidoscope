// Behavioral tests for the persistence pure module (src/persistence/state.ts):
// the tolerant parse, the book-pruning reconcile, and the patch merge/projection
// helpers. The provider is a thin write-through over these; the store boundary
// is exercised with a plain in-memory fake.

import { describe, expect, test } from 'bun:test';
import type { KaleidoscopePresetBook } from '../src/kaleidoscope.preset-book.types';
import {
  DEFAULT_MASK,
  type KaleidoscopeStateStore,
  mergePatch,
  parseStoredKaleidoscopeState,
  patchListFor,
  pruneStoredState,
  type StoredKaleidoscopeState,
  serializeKaleidoscopeState,
} from '../src/persistence/state';

const book = {
  aurora: {
    name: 'Aurora',
    taxonomy: ['Shaders'],
    layers: [
      { id: 'sky', shader: 'plasma', uniforms: {} },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  cabin: {
    name: 'Cabin',
    taxonomy: ['Backgrounds'],
    layers: [
      { id: 'cabin', shader: 'image', source: 'cabin' },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
} as const satisfies KaleidoscopePresetBook;

const stored = (overrides: Partial<StoredKaleidoscopeState> = {}): StoredKaleidoscopeState => ({
  version: 1,
  presetId: 'aurora',
  mask: { hardness: 0.4, threshold: 0.7 },
  patches: { aurora: { sky: { uSpeed: 0.9, uColor: [1, 0, 0] } } },
  ...overrides,
});

describe('serialize + parse roundtrip', () => {
  test('a serialized state parses back identical', () => {
    const state = stored();
    expect(parseStoredKaleidoscopeState(serializeKaleidoscopeState(state))).toEqual(state);
  });

  test('a state with no selection and no patches roundtrips', () => {
    const state = stored({ presetId: null, patches: {} });
    expect(parseStoredKaleidoscopeState(serializeKaleidoscopeState(state))).toEqual(state);
  });
});

describe('tolerant parse', () => {
  test.each([
    ['null input', null],
    ['empty string', ''],
    ['malformed JSON', '{nope'],
    ['non-object', '"a string"'],
    ['wrong version', JSON.stringify({ ...stored(), version: 2 })],
    ['missing mask', JSON.stringify({ version: 1, presetId: null })],
    [
      'non-numeric mask',
      JSON.stringify({ version: 1, presetId: null, mask: { hardness: 'x', threshold: 0.5 } }),
    ],
    ['non-string presetId', JSON.stringify({ version: 1, presetId: 42, mask: DEFAULT_MASK })],
  ])('%s reads as null', (_label, raw) => {
    expect(parseStoredKaleidoscopeState(raw)).toBeNull();
  });

  test('mask values clamp to 0..1', () => {
    const raw = JSON.stringify(stored({ mask: { hardness: -3, threshold: 9 } }));
    expect(parseStoredKaleidoscopeState(raw)?.mask).toEqual({ hardness: 0, threshold: 1 });
  });

  test('missing patches reads as an empty map', () => {
    const { patches: _omitted, ...rest } = stored();
    expect(parseStoredKaleidoscopeState(JSON.stringify(rest))?.patches).toEqual({});
  });

  test('a malformed patches subtree degrades to the valid subset', () => {
    const raw = JSON.stringify(
      stored({
        patches: {
          aurora: {
            sky: { uSpeed: 0.9, uBad: 'string', uWorse: [1, 'x'] },
            broken: 'not-an-object',
          },
          junk: 42,
        } as never,
      }),
    );
    expect(parseStoredKaleidoscopeState(raw)?.patches).toEqual({
      aurora: { sky: { uSpeed: 0.9 } },
    });
  });
});

describe('pruneStoredState', () => {
  test('a preset id absent from the book reads as none', () => {
    const pruned = pruneStoredState(stored({ presetId: 'retired' }), book);
    expect(pruned.presetId).toBeNull();
  });

  test('patches for vanished presets and layers are dropped; valid ones kept', () => {
    const pruned = pruneStoredState(
      stored({
        patches: {
          aurora: { sky: { uSpeed: 0.9 }, gone: { uX: 1 } },
          retired: { sky: { uSpeed: 0.1 } },
        },
      }),
      book,
    );
    expect(pruned.patches).toEqual({ aurora: { sky: { uSpeed: 0.9 } } });
  });

  test('non-tunable layers (image, direct) cannot carry patches', () => {
    const pruned = pruneStoredState(
      stored({ patches: { cabin: { cabin: { uX: 1 }, you: { uY: 2 } } } }),
      book,
    );
    expect(pruned.patches).toEqual({});
  });

  test('mask passes through untouched', () => {
    expect(pruneStoredState(stored(), book).mask).toEqual({ hardness: 0.4, threshold: 0.7 });
  });
});

describe('mergePatch + patchListFor', () => {
  test('a patch merges over prior uniforms for the same layer', () => {
    const merged = mergePatch({ aurora: { sky: { uSpeed: 0.2, uScale: 1 } } }, 'aurora', {
      id: 'sky',
      uniforms: { uSpeed: 0.9 },
    });
    expect(merged).toEqual({ aurora: { sky: { uSpeed: 0.9, uScale: 1 } } });
  });

  test('patches to other presets and layers are preserved', () => {
    const merged = mergePatch(
      { aurora: { sky: { uSpeed: 0.2 } }, cabin: { fire: { uGlow: 1 } } },
      'aurora',
      { id: 'haze', uniforms: { uDensity: 0.5 } },
    );
    expect(merged).toEqual({
      aurora: { sky: { uSpeed: 0.2 }, haze: { uDensity: 0.5 } },
      cabin: { fire: { uGlow: 1 } },
    });
  });

  test('patchListFor projects the verb-shaped array; unknown preset is empty', () => {
    const patches = { aurora: { sky: { uSpeed: 0.9 }, haze: { uDensity: 0.5 } } };
    expect(patchListFor(patches, 'aurora')).toEqual([
      { id: 'sky', uniforms: { uSpeed: 0.9 } },
      { id: 'haze', uniforms: { uDensity: 0.5 } },
    ]);
    expect(patchListFor(patches, 'cabin')).toEqual([]);
  });
});

describe('store boundary', () => {
  test('an in-memory store roundtrips through serialize + parse', async () => {
    let backing: string | null = null;
    const store: KaleidoscopeStateStore = {
      load: () => Promise.resolve(parseStoredKaleidoscopeState(backing)),
      save: (state) => {
        backing = serializeKaleidoscopeState(state);
        return Promise.resolve();
      },
    };
    expect(await store.load()).toBeNull();
    await store.save(stored());
    expect(await store.load()).toEqual(stored());
  });
});
