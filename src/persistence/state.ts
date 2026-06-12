// Persistence: the pure state module. The stored shape, its key, the tolerant
// parse, and the pure helpers the provider uses to prune, merge, and project
// stored state. No React, no storage; the store interface is the only boundary
// (a consumer may back it with AsyncStorage, localStorage, MMKV, anything
// promise-shaped). Everything here is unit-testable in plain Node.
//
// What persists is the person's selection: the preset id they last applied, the
// per-layer uniform patches they dialed in through the control panels (keyed by
// preset, so tweaks to several presets all survive), and the shared mask edge.

import type { MaskInput } from '../kaleidoscope/types';
import type { KaleidoscopePresetBook } from '../kaleidoscope.preset-book.types';

/** One layer's stored uniform overrides (the wire shape `onPatch` emits). */
export type StoredLayerUniforms = Readonly<Record<string, number | readonly number[]>>;

/** A preset's stored overrides, keyed by layer id. */
export type StoredPatchMap = Readonly<Record<string, StoredLayerUniforms>>;

/** Every preset's stored overrides, keyed by preset id. */
export type StoredPatches = Readonly<Record<string, StoredPatchMap>>;

/** The single live-patch shape, identical to `KaleidoscopeControls['onPatch']`'s argument. */
export type StoredPatch = {
  readonly id: string;
  readonly uniforms: StoredLayerUniforms;
};

export type StoredKaleidoscopeState = {
  readonly version: 1;
  /** The last-applied preset id, or null when nothing was selected. */
  readonly presetId: string | null;
  /** The shared segmentation edge. */
  readonly mask: MaskInput;
  /** Per-preset, per-layer uniform overrides from the control panels. */
  readonly patches: StoredPatches;
};

/**
 * The backing store. `load` resolves null when nothing (or nothing readable) is
 * stored; `save` swallows its own failures (persistence is a convenience, never
 * a crash).
 */
export interface KaleidoscopeStateStore {
  load(): Promise<StoredKaleidoscopeState | null>;
  save(state: StoredKaleidoscopeState): Promise<void>;
}

export const KALEIDOSCOPE_STATE_KEY = 'kaleidoscope.state.v1';

export const DEFAULT_MASK: MaskInput = { hardness: 0.5, threshold: 0.5 };

export const serializeKaleidoscopeState = (state: StoredKaleidoscopeState): string =>
  JSON.stringify(state);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const isUniformValue = (value: unknown): value is number | readonly number[] =>
  typeof value === 'number' ||
  (Array.isArray(value) && value.every((entry) => typeof entry === 'number'));

// A patch map (layer id -> uniforms) with every malformed entry dropped.
const parsePatchMap = (raw: unknown): StoredPatchMap | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, StoredLayerUniforms> = {};
  for (const [layerId, uniforms] of Object.entries(raw)) {
    if (typeof uniforms !== 'object' || uniforms === null || Array.isArray(uniforms)) continue;
    const kept: Record<string, number | readonly number[]> = {};
    for (const [key, value] of Object.entries(uniforms)) {
      if (isUniformValue(value)) kept[key] = value;
    }
    if (Object.keys(kept).length > 0) out[layerId] = kept;
  }
  return out;
};

/**
 * Tolerant parse: any malformed or wrong-version payload reads as null, and a
 * malformed `patches` subtree degrades to the valid subset rather than killing
 * the whole state. Mask values clamp to 0..1 (the verbs' documented range).
 */
export const parseStoredKaleidoscopeState = (
  raw: string | null,
): StoredKaleidoscopeState | null => {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  if (candidate.presetId !== null && typeof candidate.presetId !== 'string') return null;
  const mask = candidate.mask as Record<string, unknown> | null | undefined;
  if (!mask || typeof mask.hardness !== 'number' || typeof mask.threshold !== 'number') {
    return null;
  }
  const patches: Record<string, StoredPatchMap> = {};
  if (typeof candidate.patches === 'object' && candidate.patches !== null) {
    for (const [presetId, rawMap] of Object.entries(candidate.patches)) {
      const map = parsePatchMap(rawMap);
      if (map && Object.keys(map).length > 0) patches[presetId] = map;
    }
  }
  return {
    version: 1,
    presetId: candidate.presetId as string | null,
    mask: { hardness: clamp01(mask.hardness), threshold: clamp01(mask.threshold) },
    patches,
  };
};

// The layer ids a preset can be patched on: the layers that carry uniforms
// (`image` and `direct` layers have none and cannot be patched).
const tunableLayerIds = (book: KaleidoscopePresetBook, presetId: string): ReadonlySet<string> => {
  const preset = book[presetId];
  if (!preset) return new Set();
  return new Set(preset.layers.filter((layer) => 'uniforms' in layer).map((layer) => layer.id));
};

/**
 * Reconcile stored state against the consumer's current book: a preset that no
 * longer exists reads as "none", a patch for a vanished preset or layer is
 * dropped. Stale state degrades silently; it never crashes the picker.
 */
export const pruneStoredState = (
  state: StoredKaleidoscopeState,
  book: KaleidoscopePresetBook,
): StoredKaleidoscopeState => {
  const presetId = state.presetId !== null && state.presetId in book ? state.presetId : null;
  const patches: Record<string, StoredPatchMap> = {};
  for (const [id, map] of Object.entries(state.patches)) {
    if (!(id in book)) continue;
    const tunable = tunableLayerIds(book, id);
    const kept: Record<string, StoredLayerUniforms> = {};
    for (const [layerId, uniforms] of Object.entries(map)) {
      if (tunable.has(layerId)) kept[layerId] = uniforms;
    }
    if (Object.keys(kept).length > 0) patches[id] = kept;
  }
  return { version: 1, presetId, mask: state.mask, patches };
};

/** Merge one live patch into a preset's stored overrides (immutably). */
export const mergePatch = (
  patches: StoredPatches,
  presetId: string,
  patch: StoredPatch,
): StoredPatches => ({
  ...patches,
  [presetId]: {
    ...patches[presetId],
    [patch.id]: { ...patches[presetId]?.[patch.id], ...patch.uniforms },
  },
});

/**
 * Project a preset's stored overrides into the array shape the `kaleidoscope`
 * verb takes as `patches`.
 */
export const patchListFor = (
  patches: StoredPatches,
  presetId: string,
): ReadonlyArray<StoredPatch> =>
  Object.entries(patches[presetId] ?? {}).map(([id, uniforms]) => ({ id, uniforms }));
