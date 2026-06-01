/**
 * Effect specs are parameterized objects. Each effect's shape carries the
 * uniforms its shader needs; the library exposes one shader per effect family
 * (blur, background-image, etc.) and consumers pick uniform values per call.
 */

import type { BackgroundPresetName } from './backgrounds';

/**
 * Geometric reorientation of the frame: an axis flip or a 90-degree rotation.
 * The operation IS the effect name (parameterless), which keeps it compatible
 * with the bare-string input form and the flat-string native registry. On web
 * these run in display space (the reference behavior); native pipelines correct
 * for the camera buffer's rotation so the on-screen result matches everywhere.
 */
export type TransformName = 'flip-x' | 'flip-y' | 'rotate-cw' | 'rotate-ccw';

export type TransformSpec = {
  readonly name: TransformName;
};

export type BlurSpec = {
  readonly name: 'blur';
  /**
   * Gaussian blur sigma (softness); higher = softer. Optional; when omitted
   * the library default applies. Clamped to [0.5, 7] on both native and web.
   *
   * Upstream's `_setVideoEffects(names)` has no argument slot, so this rides
   * the effect-tuning side-channel that already carries uniforms across the
   * bridge: the facade routes it through the Expo Module's tuning function and
   * the per-frame processors read it each frame. The single-active-art-axis
   * model makes a per-call value correct (only one blur is ever active).
   */
  readonly sigma?: number;
};

export type BackgroundImageSpec = {
  readonly name: 'background-image';
  /**
   * Either a bundled preset name (autocompleted; see src/backgrounds.ts) or
   * a free-form URL / data URI. Web accepts both; native only resolves
   * bundled preset names because the upstream rn-webrtc registry takes flat
   * strings, not URIs.
   *
   * The `string & {}` trick preserves preset-name autocomplete while still
   * permitting arbitrary URL inputs without a separate union branch.
   *
   * SECURITY (web): a URL/data-URI `source` is fetched in the page origin and
   * decoded to a texture. If you wire this from end-user input, validate the
   * URL yourself; the library does not allowlist fetch targets. Decoded
   * dimensions are capped and the per-source cache is bounded, but an
   * unvalidated `source` can still issue a same-origin request you did not
   * intend.
   */
  readonly source: BackgroundPresetName | (string & {});
  /**
   * Native identity (the preset/book id). On native the effect is registered
   * and the asset is copied by this id (`background-image-<id>`), so the
   * dispatch sends the id, not the resolved `source` (which is a URL on web and
   * a name on native, and differs from the id for a consumer's own image). Set
   * by `kaleidoscope(cmd)`; absent for raw `applyVideoEffects`, which falls
   * back to `source`.
   */
  readonly id?: string;
};

/** RGB color, each channel in [0, 1]. */
export type RGB = readonly [number, number, number];

/**
 * A generic generative-shader background. `shader` names an entry in the
 * codegen shader registry (e.g. `'plasma'`); `uniforms` are its u-prefixed
 * values, bound by name and type. The person is composited over the shader's
 * output through the segmentation mask. This one spec carries every procedural
 * shader, so adding a shader needs no new spec, dispatch case, or processor —
 * just the `.frag` (which codegens into the registry) and its option contract.
 *
 * `uTime`/`uResolution` are supplied by the processor and not listed here.
 */
export type ShaderSpec = {
  readonly name: 'shader';
  readonly shader: string;
  readonly uniforms: Readonly<Record<string, number | readonly number[]>>;
};

/** How a scene layer blends over the layers beneath it (painter's order). */
export type BlendMode = 'normal' | 'additive';

/**
 * Which part of the frame a layer applies to. Omit for `'background'` (the
 * accumulated stack so far); `'subject'` stencils the layer to the segmented
 * person. The same shader can run on either target.
 */
export type LayerTarget = 'background' | 'subject';

/**
 * The closed catalog of layer shaders and the fields each one requires. Keeping
 * it closed (mirrors `ShaderOptionsMap` for presets) is what lets the `shader`
 * discriminant narrow cleanly on a `LayerSpec`:
 *   - `'image'`  replaces the target with a still image (needs `source`).
 *   - `'direct'` passes the target through unchanged (a matrix passthrough): on
 *     the subject that is the masked person; on the background it is a no-op.
 *   - a generative/overlay shader (e.g. `'godrays'`) renders its frag fed
 *     `uTime`/`uResolution` plus the supplied u-prefixed `uniforms`.
 * Register a generative layer shader by adding it here.
 */
export type LayerShaderOptions = {
  readonly image: { readonly source: string };
  readonly direct: Record<never, never>;
  readonly godrays: { readonly uniforms: Readonly<Record<string, number | readonly number[]>> };
  readonly clouds: { readonly uniforms: Readonly<Record<string, number | readonly number[]>> };
  readonly fireflies: { readonly uniforms: Readonly<Record<string, number | readonly number[]>> };
  readonly plasma: { readonly uniforms: Readonly<Record<string, number | readonly number[]>> };
  readonly nebula: { readonly uniforms: Readonly<Record<string, number | readonly number[]>> };
  readonly simianlights: {
    readonly uniforms: Readonly<Record<string, number | readonly number[]>>;
  };
  readonly 'anamorphic-lensflare': {
    readonly uniforms: Readonly<Record<string, number | readonly number[]>>;
  };
};

/** A layer shader name; the `LayerSpec` discriminant. */
export type LayerShaderName = keyof LayerShaderOptions;

/**
 * One scene layer: a `shader` applied to a `target`, with an optional `blend`.
 * The `shader` is the discriminant and carries that shader's required fields
 * (a discriminated union over the closed `LayerShaderOptions`), so narrowing on
 * `layer.shader` gives `source` / `uniforms` / nothing as appropriate.
 */
export type LayerSpec = {
  readonly [S in LayerShaderName]: {
    readonly shader: S;
    readonly target?: LayerTarget;
    readonly blend?: BlendMode;
  } & LayerShaderOptions[S];
}[LayerShaderName];

/**
 * A composed scene: an ordered painter's stack of layers, run by the scene
 * compositor as a single effect (one stage), distinct from the serial
 * single-effect path. Layer 0 is the base; later layers blend over it.
 */
export type SceneSpec = {
  readonly name: 'scene';
  readonly layers: ReadonlyArray<LayerSpec>;
};

export type EffectSpec = TransformSpec | BlurSpec | BackgroundImageSpec | ShaderSpec | SceneSpec;

/**
 * Legacy alias for the discriminant. Useful for typed switch statements and
 * the bare-string call shape (`applyVideoEffects(track, ['blur'])`).
 */
export type EffectName = EffectSpec['name'];

/**
 * applyVideoEffects accepts either a bare effect name (no params; library
 * picks sensible defaults) or a full EffectSpec object with parameters.
 */
export type EffectInput = EffectSpec | EffectName;

/**
 * Apply zero or more effects to a local `MediaStreamTrack`.
 *
 * - Native: thin facade over `track._setVideoEffects(names)` from
 *   `react-native-webrtc`. Returns the same track reference; mutation is in place.
 *   This is the lower-level primitive; per-effect parameters (blur sigma, mask
 *   edge) reach the GPU via the effect-tuning channel, driven by `bindKaleidoscope`.
 * - Web: builds an Insertable-Streams pipeline with `MediaStreamTrackProcessor`
 *   and `MediaStreamTrackGenerator` and returns a NEW track carrying the
 *   transformed frames. Replace the upstream sender's track with the return value
 *   (`sender.replaceTrack(returnedTrack)`) to apply effects to a peer connection,
 *   or attach it to a `<video>` element for local preview.
 *
 * Throws on remote tracks, unknown effect names, missing platform capabilities
 * (web: Insertable Streams; native: peer-dep `_setVideoEffects`), or non-video
 * tracks.
 */
export type ApplyVideoEffects = (
  track: MediaStreamTrack,
  effects: ReadonlyArray<EffectInput>,
) => MediaStreamTrack;

/**
 * Normalize an EffectInput (bare name or spec) into an EffectSpec.
 */
export const toEffectSpec = (input: EffectInput): EffectSpec =>
  typeof input === 'string' ? ({ name: input } as EffectSpec) : input;
