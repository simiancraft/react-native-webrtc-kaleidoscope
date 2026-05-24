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
  // Blur strength is tuned globally via the tuning setters (setBlurSigma),
  // not per-call; there is no per-spec parameter.
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
   */
  readonly source: BackgroundPresetName | (string & {});
};

export type EffectSpec = TransformSpec | BlurSpec | BackgroundImageSpec;

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
 *   Effects are tuned globally via the tuning setters (setBlurSigma, etc.),
 *   not via per-call spec parameters.
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
