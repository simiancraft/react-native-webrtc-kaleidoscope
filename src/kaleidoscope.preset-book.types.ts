// Point of entry #1: the preset-book vocabulary.
//
// The declarative types a consumer writes in their `kaleidoscope.preset-book.ts`.
// This is the root of the type tree: a preset book is a record of named presets;
// a preset is a name + taxonomy + (optional) thumbnail + (optional) controls + an
// ordered stack of layers. Everything else in the library is either the runtime
// that commands these, the prebuild that places their assets, or the components
// that author them.
//
// Per shader-world convention, numeric uniforms are normalized 0..1 where
// practical; ranges are JSDoc hints for IntelliSense, not enforced at runtime.

import type { ComponentType } from 'react';
import type { KaleidoscopeLayer } from './types';

/**
 * A preset's place in the picker: an ordered path of group names, deepest last.
 * One level (`['Backgrounds']`) is a flat group; two (`['Worlds', 'Wizard Tower']`)
 * is group then subgroup. The list IS the depth, so a group can't be set without
 * its parent. Extend to three levels by adding a member here when needed.
 */
export type KaleidoscopeTaxonomy = readonly [string] | readonly [string, string];

/**
 * One preset: an ordered painter's stack of layers under one book name, plus
 * display metadata (`name`, `taxonomy`, optional `thumbnail`). `kaleidoscope(id)`
 * runs the whole stack as one composite through the one compositor.
 */
export type KaleidoscopePreset = {
  /** Human-readable label for the picker. */
  readonly name: string;
  /** Grouping path for the picker, root first (e.g. `['Worlds', 'Wizard Tower']`). */
  readonly taxonomy: KaleidoscopeTaxonomy;
  /**
   * Optional thumbnail source for the picker rail.
   * - `string`: a resolved URL (web) or native preset name routed through the
   *   image resolver.
   * - `number`: a Metro asset module id (the result of `require('./foo.webp')`),
   *   consumed directly by `<Image source={number}>` without a URI hop. The
   *   library's packaged presets use this on native (their `.web.ts` siblings
   *   use the string form via `Asset.fromModule(...).uri`).
   */
  readonly thumbnail?: string | number;
  /** The painter's stack, back to front. Each layer's `id` is unique here. */
  readonly layers: ReadonlyArray<KaleidoscopeLayer>;
  /**
   * Optional tuning component for this preset: a component the Tuner renders,
   * which mounts a `ControlForm` + `ControlSection` per tunable layer. The Tuner
   * supplies the chrome wrapper at the layer level, so this component composes
   * shader fragments and must not add its own. `undefined` renders nothing. The
   * `import type` keeps presets runtime-React-free.
   */
  readonly controls?: ComponentType<KaleidoscopeControls>;
};

/**
 * What the Tuner passes a preset's `controls` component: the per-layer baked
 * uniforms keyed by layer id, and the single shared `onPatch` every layer's
 * `ControlForm` emits through (the `id` discriminates). Intentionally loose at
 * this boundary (heterogeneous layers); per-shader typing is recovered inside
 * each `<Shader>Controls` via `makeControls<U>()`.
 */
export type KaleidoscopeControls = {
  readonly uniforms: Readonly<Record<string, Readonly<Record<string, number | readonly number[]>>>>;
  readonly onPatch: (patch: {
    readonly id: string;
    readonly uniforms: Record<string, number | readonly number[]>;
  }) => void;
  readonly disabled?: boolean;
};

/** The consumer's book: a flat record of presets keyed by id. */
export type KaleidoscopePresetBook = Readonly<Record<string, KaleidoscopePreset>>;

/**
 * A materialized book entry: a `KaleidoscopePreset` plus the `id` it was keyed
 * by. This is what the picker and the tuner iterate (the book is keyed; this
 * carries the key inline so a flattened list keeps its identity).
 */
export type KaleidoscopePresetEntry = { readonly id: string } & KaleidoscopePreset;
