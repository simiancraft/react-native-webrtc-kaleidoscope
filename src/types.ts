/**
 * Effect specs are parameterized objects. Every visual effect is one
 * `CompositeSpec` (an ordered painter's stack of layers, run by the one
 * compositor) or one `TransformSpec` (a geometric reorientation). There is no
 * longer a singleton-shader path: blur, background images, and generative
 * shaders are all layers inside a composite.
 */

// Type-only (erased at runtime); ties a generative layer's baked `uniforms` to
// its shader's uniform type so bakes are checked against the single source.
import type { ShaderUniformsMap } from './shaders';

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

/** RGB color, each channel in [0, 1]. */
export type RGB = readonly [number, number, number];

/** How a composite layer blends over the layers beneath it (painter's order). */
export type BlendMode = 'normal' | 'additive';

/**
 * Which part of the frame a layer applies to. Omit for `'background'` (the
 * accumulated stack so far); `'subject'` stencils the layer to the segmented
 * person. The same shader can run on either target.
 */
export type LayerTarget = 'background' | 'subject';

/**
 * The closed catalog of layer shaders and the fields each one requires. Keeping
 * it closed (mirrors `ShaderUniformsMap` for presets) is what lets the `shader`
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
  /** Camera-sampling separable gaussian; `sigma` is its softness. */
  readonly blur: { readonly uniforms: Partial<ShaderUniformsMap['blur']> };
  readonly godrays: { readonly uniforms: Partial<ShaderUniformsMap['godrays']> };
  readonly clouds: { readonly uniforms: Partial<ShaderUniformsMap['clouds']> };
  readonly fireflies: { readonly uniforms: Partial<ShaderUniformsMap['fireflies']> };
  readonly plasma: { readonly uniforms: Partial<ShaderUniformsMap['plasma']> };
  readonly nebula: { readonly uniforms: Partial<ShaderUniformsMap['nebula']> };
  readonly simianlights: { readonly uniforms: Partial<ShaderUniformsMap['simianlights']> };
  readonly 'anamorphic-lensflare': {
    readonly uniforms: Partial<ShaderUniformsMap['anamorphic-lensflare']>;
  };
  readonly 'light-beams-and-motes': {
    readonly uniforms: Partial<ShaderUniformsMap['light-beams-and-motes']>;
  };
  readonly 'corporate-blobs': {
    readonly uniforms: Partial<ShaderUniformsMap['corporate-blobs']>;
  };
};

/** A layer shader name; the `LayerSpec` discriminant. */
export type LayerShaderName = keyof LayerShaderOptions;

/**
 * One composite layer: a `shader` applied to a `target`, with an optional `blend`.
 * The `shader` is the discriminant and carries that shader's required fields
 * (a discriminated union over the closed `LayerShaderOptions`), so narrowing on
 * `layer.shader` gives `source` / `uniforms` / nothing as appropriate.
 *
 * `id` is required and unique WITHIN one composite. It is the address a
 * `PatchFor` resolves against (the live uniform channel keys overrides by it),
 * and for an `image` layer it doubles as the native plate id (the bundled WebP
 * basename), since the native facade sends `layer.id` as the plate `source`.
 */
export type LayerSpec = {
  readonly [S in LayerShaderName]: {
    readonly id: string;
    readonly shader: S;
    readonly target?: LayerTarget;
    readonly blend?: BlendMode;
  } & LayerShaderOptions[S];
}[LayerShaderName];

/**
 * A composed effect: an ordered painter's stack of layers, run by the one
 * compositor as a single stage. Layer 0 is the base; later layers blend over
 * it. This is the sole art spec; every former singleton (blur, background
 * image, generative shader) is now a layer inside a composite.
 */
export type CompositeSpec = {
  readonly name: 'composite';
  readonly layers: ReadonlyArray<LayerSpec>;
};

export type EffectSpec = CompositeSpec | TransformSpec;

/**
 * The discriminant. Useful for typed switch statements and the bare-string call
 * shape for the parameterless transforms (`applyVideoEffects(track, ['flip-x'])`).
 * `'composite'` is a name too, but a bare `'composite'` carries no layers, so
 * only the transform names are meaningful as bare-string inputs.
 */
export type EffectName = EffectSpec['name'];

/**
 * applyVideoEffects accepts either a bare effect name (the parameterless
 * transforms) or a full EffectSpec object (a composite or a transform).
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
