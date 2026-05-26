// The kaleidoscope() command layer: types.
//
// Everything is a shader. A preset is a shader plus its frozen options, under a
// name. The consumer declares a flat book of presets; kaleidoscope() binds a
// track and that book once, then commands presets by name. Each shader declares
// its axis (art vs transform); a command replaces only that axis, so art and
// transform compose. This is the type layer of issue #26.
//
// Shader option contracts are hand-authored here for now; generating them from
// the shader source (reflection + a drift gate) is tracked in #30.

import type { BackgroundImageSpec, RGB, TransformName } from '../types';

/**
 * The two independently-composable axes. Art is the background treatment (one
 * of blur / image / a procedural shader); transform is the geometric
 * reorientation applied last. One selection per axis.
 */
export type Axis = 'art' | 'transform';

/**
 * The shader catalog and each shader's option type. Adding a shader is a new
 * key here plus its source; consumers add presets over these, never new
 * shaders. `blur` and `background-image` are the existing engines addressed as
 * shaders; `plasma` is the first procedural one; `transform` is the geometry
 * engine.
 */
export type ShaderOptionsMap = {
  readonly blur: { readonly sigma?: number };
  readonly 'background-image': { readonly source: BackgroundImageSpec['source'] };
  readonly plasma: {
    readonly colorA?: RGB;
    readonly colorB?: RGB;
    readonly speed?: number;
    readonly scale?: number;
  };
  readonly transform: { readonly op: TransformName };
};

export type ShaderName = keyof ShaderOptionsMap;

/** Each shader's axis, declared once. The dispatcher infers a command's axis. */
export const SHADER_AXIS = {
  blur: 'art',
  'background-image': 'art',
  plasma: 'art',
  transform: 'transform',
} as const satisfies Record<ShaderName, Axis>;

/**
 * A preset: a shader paired with options of the matching type (a discriminated
 * union keyed on `shader`, so a wrong options shape for a shader is a compile
 * error). The book is a flat record of these keyed by the consumer's name.
 */
export type Preset = {
  [S in ShaderName]: { readonly shader: S; readonly options: ShaderOptionsMap[S] };
}[ShaderName];

export type PresetBook = Readonly<Record<string, Preset>>;

export type KaleidoscopeBindOptions<P extends PresetBook> = {
  /** The consumer's preset book. Declare it `as const satisfies PresetBook`. */
  readonly presets: P;
  /**
   * Called with the live output track after every command. On web each command
   * yields a NEW MediaStreamTrack (the pipeline is rebuilt); on native the same
   * track is mutated in place and passed back. Read the track from here rather
   * than threading a return value.
   */
  readonly onTrack?: (track: MediaStreamTrack) => void;
};

/**
 * A bound kaleidoscope session for one track and one preset book. `set`
 * commands a preset by name (with optional per-call option overrides), inferring
 * the axis from the preset's shader; `clear` empties an axis. `track` is the
 * current output. `dispose` tears down the pipeline (web) and releases the
 * session.
 */
export interface KaleidoscopeSession<P extends PresetBook> {
  set<C extends keyof P>(cmd: C, opts?: Partial<ShaderOptionsMap[P[C]['shader']]>): void;
  clear(axis: Axis): void;
  readonly track: MediaStreamTrack;
  dispose(): void;
}
