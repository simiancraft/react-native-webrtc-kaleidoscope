// The three-verb surface: types.
//
// Bind a track and a preset book once; get three typed verbs back:
//   - kaleidoscope(cmd, opts?)  the art axis: which shader fills the background
//     (blur / background-image / plasma). cmd is a preset id from the book
//     (narrowed), opts optionally overrides that preset's options (narrowed to
//     the preset's shader). kaleidoscope(null) clears the art.
//   - transform(t?)             the geometry axis: absolute flips + 90° rotation.
//   - mask(m)                   the segmentation edge shared by every art effect.
//
// Shaders live in the library; consumers add presets over them, never new
// shaders. Option types are hand-authored here (generating them from the shader
// source is tracked in #30). Per shader-world convention, numeric uniforms are
// normalized 0..1 where practical; ranges are documented in JSDoc as hints for
// IntelliSense and tooling, not enforced at runtime (validation is userland).

import type { BackgroundImageSpec, RGB } from '../types';

/**
 * The art shader catalog and each shader's option type. A book preset picks one
 * of these and freezes its options; `kaleidoscope` commands the preset by name.
 */
export type ShaderOptionsMap = {
  readonly blur: {
    /** Gaussian blur sigma (softness). Higher = softer. Clamped [0.5, 7]. */
    readonly sigma?: number;
  };
  readonly 'background-image': {
    /** Bundled preset name, a URL/data-URI (web), or a required asset. */
    readonly source: BackgroundImageSpec['source'];
  };
  readonly plasma: {
    /** First palette color, RGB each channel 0..1. */
    readonly colorA?: RGB;
    /** Second palette color, RGB each channel 0..1. */
    readonly colorB?: RGB;
    /** Animation rate. 0 freezes the field. */
    readonly speed?: number;
    /** Spatial frequency. Higher = more, tighter cells. */
    readonly scale?: number;
  };
};

export type ShaderName = keyof ShaderOptionsMap;

/**
 * A preset: a shader paired with options of the matching type (a discriminated
 * union keyed on `shader`, so a wrong options shape is a compile error). The
 * book is a flat record of these keyed by the consumer's chosen name.
 */
export type Preset = {
  [S in ShaderName]: { readonly shader: S; readonly options: ShaderOptionsMap[S] };
}[ShaderName];

export type PresetBook = Readonly<Record<string, Preset>>;

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

/** The art verb: set a preset by name (with optional option override), or clear. */
interface KaleidoscopeCommand<P extends PresetBook> {
  <C extends keyof P>(cmd: C, opts?: Partial<ShaderOptionsMap[P[C]['shader']]>): void;
  (cmd: null): void;
}

/**
 * The three verbs for one bound track and book, plus the live track and a
 * teardown. `kaleidoscope` and `transform` rebuild the composite (web yields a
 * new track via onTrack); `mask` updates the segmentation edge the running
 * composite reads each frame, so it needs no rebuild.
 */
export interface KaleidoscopeControls<P extends PresetBook> {
  readonly kaleidoscope: KaleidoscopeCommand<P>;
  readonly transform: (t?: TransformInput) => void;
  readonly mask: (m: MaskInput) => void;
  readonly track: MediaStreamTrack;
  readonly dispose: () => void;
}
