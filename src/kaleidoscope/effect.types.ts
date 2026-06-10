// The runtime effect contract: the lower-level spec the drivers consume.
//
// A consumer never writes these; they sit below the preset-book vocabulary. A
// `KaleidoscopePreset` projects into a `CompositeSpec` (see shader-to-spec), the
// transform verb produces `TransformSpec`s, and `applyVideoEffects` takes the
// union. Each driver (android / ios / web-driver) renders this same spec.

import type { KaleidoscopeLayer } from '../kaleidoscope.preset-book.types';

/**
 * Geometric reorientation of the frame: an axis flip or a 90-degree rotation.
 * The operation IS the effect name (parameterless), compatible with the
 * bare-string input form and the flat-string native registry. On web these run
 * in display space; native pipelines correct for the camera buffer's rotation.
 */
export type TransformName = 'flip-x' | 'flip-y' | 'rotate-cw' | 'rotate-ccw';

export type TransformSpec = {
  readonly name: TransformName;
};

/**
 * A composed effect: an ordered painter's stack of layers, run by the one
 * compositor as a single stage. Layer 0 is the base; later layers blend over it.
 * Every former singleton (blur, image, generative shader) is a layer inside it.
 */
export type CompositeSpec = {
  readonly name: 'composite';
  readonly layers: ReadonlyArray<KaleidoscopeLayer>;
};

export type EffectSpec = CompositeSpec | TransformSpec;

/**
 * The discriminant. Useful for typed switch statements and the bare-string call
 * shape for the parameterless transforms (`applyVideoEffects(track, ['flip-x'])`).
 */
export type EffectName = EffectSpec['name'];

/**
 * `applyVideoEffects` accepts either a bare transform name (the parameterless
 * transforms) or a full `EffectSpec` object (a composite or a transform). The
 * bare-string form is `TransformName`, NOT `EffectName`: a bare `'composite'`
 * would normalize to a layerless spec and crash the compositor, so the type
 * rejects it. A composite must always arrive as a full `CompositeSpec`.
 */
export type EffectInput = EffectSpec | TransformName;

/**
 * Apply zero or more effects to a local `MediaStreamTrack`.
 *
 * - Native: thin facade over `track._setVideoEffects(names)` from
 *   `react-native-webrtc`. Returns the same track reference; mutation is in place.
 * - Web: builds an Insertable-Streams pipeline and returns a NEW track carrying
 *   the transformed frames.
 *
 * Throws on remote tracks, unknown effect names, missing platform capabilities,
 * or non-video tracks.
 */
export type ApplyVideoEffects = (
  track: MediaStreamTrack,
  effects: ReadonlyArray<EffectInput>,
) => MediaStreamTrack;
