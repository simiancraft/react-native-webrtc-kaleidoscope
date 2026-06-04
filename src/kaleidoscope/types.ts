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

import type { KaleidoscopePresetBook } from '../kaleidoscope.preset-book.types';
import type { PatchableShaderName, ShaderUniformsMap } from '../shaders';

/**
 * A live per-layer uniform override for ONE layer, derived from the layer's own
 * type: `id` is the layer's id, `uniforms` is `Partial` of the shader's uniform
 * type (re-indexed from `ShaderUniformsMap` by the layer's literal `shader`).
 * Non-tunable layers (`image`, `direct`) distribute to `never`, so they cannot be
 * patched. The runtime resolves by `id`; the shader is never sent on the wire.
 */
export type PatchFor<L> = L extends {
  readonly id: infer I extends string;
  readonly shader: infer S extends PatchableShaderName;
}
  ? { readonly id: I; readonly uniforms: Partial<ShaderUniformsMap[S]> }
  : never;

/**
 * The patches `kaleidoscope` accepts for preset `K` in book `P`: per-layer
 * overrides, each addressed by one of that preset's tunable layer ids and typed
 * by that layer's shader. At a literal `cmd` call site this narrows to the
 * preset's ids/uniforms; with a variable `cmd` it widens to the book-wide union
 * and is runtime-checked by id.
 */
export type PatchesFor<P extends KaleidoscopePresetBook, K extends keyof P> = ReadonlyArray<
  PatchFor<P[K]['layers'][number]>
>;

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

export type KaleidoscopeBindOptions<P extends KaleidoscopePresetBook> = {
  /** The consumer's preset book. Declare it `as const satisfies KaleidoscopePresetBook`. */
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
type KaleidoscopeCommand<P extends KaleidoscopePresetBook> = <K extends keyof P>(
  cmd: K | null,
  patches?: PatchesFor<P, K>,
) => void;

/**
 * The three verbs for one bound track and book, plus the live track and a
 * teardown. `kaleidoscope` (preset switch) and `transform` rebuild the composite
 * (web yields a new track via onTrack); a `kaleidoscope` patch of the active
 * preset and `mask` both update what the running composite reads each frame, so
 * they need no rebuild.
 */
export interface KaleidoscopeBinding<P extends KaleidoscopePresetBook> {
  readonly kaleidoscope: KaleidoscopeCommand<P>;
  readonly transform: (t?: TransformInput) => void;
  readonly mask: (m: MaskInput) => void;
  readonly track: MediaStreamTrack;
  readonly dispose: () => void;
}
