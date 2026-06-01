// The three-verb surface: types.
//
// Bind a track and a preset book once; get three typed verbs back:
//   - kaleidoscope(cmd, patches?)  the art axis: which composite (layer stack)
//     fills the frame. cmd is a preset id from the book (narrowed), or null to
//     clear. patches optionally merge per-layer uniform overrides (addressed by
//     layer id); patching the currently-active preset routes through the live
//     no-rebuild channel, so sliders stay smooth.
//   - transform(t?)             the geometry axis: absolute flips + 90° rotation.
//   - mask(m)                   the segmentation edge shared by every art effect.
//
// Shaders live in the library; consumers add presets (composites) over them,
// never new shaders. Per shader-world convention, numeric uniforms are
// normalized 0..1 where practical; ranges are documented in JSDoc as hints for
// IntelliSense and tooling, not enforced at runtime (validation is userland).

import type { PatchableShaderName, ShaderUniformsMap } from '../shaders';
import type { LayerSpec } from '../types';

/**
 * A composite: an ordered painter's stack of layers under one book name, plus
 * display metadata (`name`, `category`, optional `thumbnail`). `kaleidoscope(id)`
 * runs the whole stack as one effect through the one compositor.
 */
export type Composite = {
  /** Human-readable label for the picker. */
  readonly name: string;
  /** Grouping axis for the picker (e.g. 'Worlds', 'Backgrounds', 'Blur'). */
  readonly category: string;
  /** Optional thumbnail source (an image source); shown in the picker rail. */
  readonly thumbnail?: string;
  /** The painter's stack, back to front. Each layer's `id` is unique here. */
  readonly layers: ReadonlyArray<LayerSpec>;
};

/** The consumer's book: a flat record of composites keyed by id. */
export type PresetBook = Readonly<Record<string, Composite>>;

/**
 * A materialized book entry: a `Composite` plus the `id` it was keyed by. This
 * is what the picker and the tuner iterate (the book is keyed; this carries the
 * key inline so a flattened list keeps its identity).
 */
export type Preset = { readonly id: string } & Composite;

/**
 * A live per-layer uniform override. Addresses a layer by `id` and carries
 * `shader` only to drive uniform-type narrowing (IntelliSense): a
 * `{ shader: 'plasma' }` patch types `uniforms` as `Partial<PlasmaUniforms>`.
 * The runtime resolves by `id` and MERGES the partial uniforms over the layer's
 * baked values; the `shader` field is asserted, not used to look up the layer.
 */
export type LayerPatch = {
  readonly [S in PatchableShaderName]: {
    readonly id: string;
    readonly shader: S;
    readonly uniforms: Partial<ShaderUniformsMap[S]>;
  };
}[PatchableShaderName];

/**
 * Absolute, stateless geometric transform. Every call is the full desired state
 * from the identity orientation: re-passing is the caller's responsibility, and
 * `transform()` (or `transform({})`) resets to identity. Rotation snaps to the
 * nearest 90°; arbitrary angles and offset are a later step.
 */
export type TransformInput = {
  /** Mirror flips about each axis. */
  readonly flip?: { readonly x?: boolean; readonly y?: boolean };
  /** Clockwise rotation in degrees; snapped to the nearest 90 (0/90/180/270). */
  readonly rotate?: number;
};

/** The segmentation mask edge, shared by every art effect (not transforms). */
export type MaskInput = {
  /** Edge hardness, 0..1. 0 = soft halo, 1 = near-step. */
  readonly hardness: number;
  /** Edge threshold, 0..1. Higher rejects low-confidence (chair-edge) pixels. */
  readonly threshold: number;
};

export type KaleidoscopeBindOptions<P extends PresetBook> = {
  /** The consumer's preset book. Declare it `as const satisfies PresetBook`. */
  readonly presets: P;
  /**
   * Called with the live output track after every art/transform command. On web
   * each command yields a NEW MediaStreamTrack (the pipeline is rebuilt); on
   * native the same track is mutated in place and passed back.
   */
  readonly onTrack?: (track: MediaStreamTrack) => void;
};

/**
 * The art verb: select a composite by id (rebuilding the pipeline), or clear it
 * with `null`. When `cmd` is the currently-active preset id and `patches` is
 * given, the patches merge through the live no-rebuild uniform channel (keyed by
 * layer id) instead of rebuilding, so a slider drag stays smooth.
 */
type KaleidoscopeCommand<P extends PresetBook> = (
  cmd: keyof P | null,
  patches?: ReadonlyArray<LayerPatch>,
) => void;

/**
 * The three verbs for one bound track and book, plus the live track and a
 * teardown. `kaleidoscope` (preset switch) and `transform` rebuild the composite
 * (web yields a new track via onTrack); a `kaleidoscope` patch of the active
 * preset and `mask` both update what the running composite reads each frame, so
 * they need no rebuild.
 */
export interface KaleidoscopeControls<P extends PresetBook> {
  readonly kaleidoscope: KaleidoscopeCommand<P>;
  readonly transform: (t?: TransformInput) => void;
  readonly mask: (m: MaskInput) => void;
  readonly track: MediaStreamTrack;
  readonly dispose: () => void;
}
