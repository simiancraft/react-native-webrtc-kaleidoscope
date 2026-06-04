// Point of entry #1: the preset-book vocabulary. The base of the pyramid.
//
// The complete, declarative lexicon a consumer writes in their
// `kaleidoscope.preset-book.ts`, and the single source of truth for it: any file
// that needs one of these types imports it from here. A preset book is a record
// of named presets; a preset is a name + taxonomy + (optional) thumbnail +
// (optional) controls + an ordered stack of layers; a layer names a `shader` from
// the catalog and carries that shader's options.
//
// What is NOT here: the runtime effect contract (`CompositeSpec` etc. live in
// `kaleidoscope/effect.types`; the consumer never writes those), the shader
// option catalog (`LayerShaderOptions` lives with the shaders it describes), and
// generic primitives (`RGB` in `lib/primitives.types`).

import type { ComponentType } from 'react';
import type { LayerShaderName, LayerShaderOptions } from './shaders';

/**
 * A preset's place in the picker: an ordered path of group names, deepest last.
 * One level (`['Backgrounds']`) is a flat group; two (`['Worlds', 'Wizard Tower']`)
 * is group then subgroup. The list IS the depth, so a group can't be set without
 * its parent. Extend to three levels by adding a member here when needed.
 */
export type KaleidoscopeTaxonomy = readonly [string] | readonly [string, string];

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

/** How a layer blends over the layers beneath it (painter's order). */
export type KaleidoscopeBlendMode = 'normal' | 'additive';

/**
 * Which part of the frame a layer applies to. Omit for `'background'` (the
 * accumulated stack so far); `'subject'` stencils the layer to the segmented
 * person. The same shader can run on either target.
 */
export type KaleidoscopeLayerTarget = 'background' | 'subject';

/**
 * One layer in a preset: a `shader` (from the catalog) applied to a `target`,
 * with optional `blend`. The `shader` is the discriminant and carries that
 * shader's required fields (a discriminated union over the catalog's
 * `LayerShaderOptions`). `id` is required and unique within one preset; it is the
 * address a patch resolves against, and for an `image` layer it doubles as the
 * bundled-WebP basename the native facade sends as the image `source`.
 */
export type KaleidoscopeLayer = {
  readonly [S in LayerShaderName]: {
    readonly id: string;
    readonly shader: S;
    readonly target?: KaleidoscopeLayerTarget;
    readonly blend?: KaleidoscopeBlendMode;
  } & LayerShaderOptions[S];
}[LayerShaderName];

/**
 * One preset: an ordered painter's stack of layers under one book name, plus
 * display metadata. `kaleidoscope(id)` runs the whole stack as one composite
 * through the one compositor.
 */
export type KaleidoscopePreset = {
  /** Human-readable label for the picker. */
  readonly name: string;
  /** Grouping path for the picker, root first (e.g. `['Worlds', 'Wizard Tower']`). */
  readonly taxonomy: KaleidoscopeTaxonomy;
  /**
   * Optional thumbnail for the picker rail.
   * - `string`: a resolved URL (web) or native preset name routed through the
   *   image resolver.
   * - `number`: a Metro asset module id (`require('./foo.webp')`), consumed
   *   directly by `<Image source={number}>`.
   */
  readonly thumbnail?: string | number;
  /** The painter's stack, back to front. Each layer's `id` is unique here. */
  readonly layers: ReadonlyArray<KaleidoscopeLayer>;
  /**
   * Optional tuning component the Tuner renders, mounting a `ControlForm` +
   * `ControlSection` per tunable layer. `undefined` renders nothing. The
   * `import type` keeps presets runtime-React-free.
   */
  readonly controls?: ComponentType<KaleidoscopeControls>;
};

/** The consumer's book: a flat record of presets keyed by id. */
export type KaleidoscopePresetBook = Readonly<Record<string, KaleidoscopePreset>>;

/**
 * A materialized book entry: a `KaleidoscopePreset` plus the `id` it was keyed
 * by. What the picker and tuner iterate (the book is keyed; this carries the key
 * inline so a flattened list keeps its identity).
 */
export type KaleidoscopePresetEntry = { readonly id: string } & KaleidoscopePreset;
