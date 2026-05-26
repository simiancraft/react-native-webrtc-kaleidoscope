// Web entry point (source). This builds to `dist/index.web.js`, which web
// bundlers resolve through the package's `browser` export condition. With an
// `exports` map present, that condition supersedes platform-extension
// resolution; the `.web.ts` suffix here is just our source convention, not what
// selects this file at consume time.
//
// applyVideoEffects(track, effects) wires an Insertable-Streams pipeline that
// chains each effect's transform and returns a new MediaStreamTrack carrying
// the transformed frames. Pass the returned track to a `<video>` element or
// to `RTCRtpSender.replaceTrack(...)`.

import { createSession, type Reconcile } from './kaleidoscope/session';
import type {
  KaleidoscopeBindOptions,
  KaleidoscopeSession,
  PresetBook,
} from './kaleidoscope/types';
import { type ApplyVideoEffects, type EffectInput, type EffectSpec, toEffectSpec } from './types';
import { makeBackgroundImage } from './web/effects/background-image';
import { blur } from './web/effects/blur';
import { makePlasma } from './web/effects/plasma';
import { makeTransform } from './web/effects/transform';
import {
  applyEffectToTrack,
  type DisposablePipeline,
  type FrameTransform,
} from './web/insertable-streams';
import { tuning } from './web/tuning';

/**
 * Set the Gaussian sigma for the blur effect. Higher = softer blur.
 * Clamped to [0.5, 7] (the useful range before the linear-sampled kernel
 * truncates and bands). Default 5.
 */
export const setBlurSigma = (value: number): void => {
  tuning.setBlurSigma(value);
};

/**
 * Set the mask smoothstep hardness for blur and background-image
 * composites, in [0, 1]. 0 = soft halo, 1 = near-step edge. Default 0.5.
 */
export const setMaskHardness = (value: number): void => {
  tuning.setMaskHardness(value);
};

/**
 * Set the mask smoothstep threshold (center of the transition) in
 * [0.05, 0.95]. 0.5 is neutral. Higher values reject low-confidence
 * pixels; lower values are more inclusive. Optimal value is platform-
 * specific because each segmentation model has a different confidence
 * distribution.
 */
export const setMaskThreshold = (value: number): void => {
  tuning.setMaskThreshold(value);
};

/**
 * Set the segmentation input short-side (px). Native-only knob (lower =
 * cheaper segmentation on older devices); stored on web for API parity but
 * the web MediaPipe pipeline does not consume it.
 */
export const setSegmentationTargetShortSide = (value: number): void => {
  tuning.setSegmentationTargetShortSide(value);
};

/**
 * Toggle native per-frame timing logs (off by default). No-op effect on web
 * beyond storing the flag.
 */
export const setDebugTiming = (value: boolean): void => {
  tuning.setDebugTiming(value);
};

/**
 * Reset all effect tuning parameters to library defaults.
 */
export const resetEffectTuning = (): void => {
  tuning.reset();
};

export type { BackgroundPresetName } from './backgrounds';
export type {
  Axis,
  KaleidoscopeBindOptions,
  KaleidoscopeSession,
  Preset,
  PresetBook,
  ShaderName,
  ShaderOptionsMap,
} from './kaleidoscope/types';
export type {
  ApplyVideoEffects,
  BackgroundImageSpec,
  BlurSpec,
  EffectInput,
  EffectName,
  EffectSpec,
  PlasmaSpec,
  RGB,
  TransformName,
  TransformSpec,
} from './types';

const specToTransform = (spec: EffectSpec): FrameTransform => {
  switch (spec.name) {
    case 'flip-x':
    case 'flip-y':
    case 'rotate-cw':
    case 'rotate-ccw':
      return makeTransform(spec.name);
    case 'blur':
      // Route the per-spec sigma into the tuning channel the per-frame blur
      // transform already reads (mirrors the native facade). Omitted sigma
      // leaves the current/default value. One blur is ever active, so a
      // shared value is correct.
      if (spec.sigma != null) {
        tuning.setBlurSigma(spec.sigma);
      }
      return blur;
    case 'background-image':
      return makeBackgroundImage(spec.source);
    case 'plasma':
      return makePlasma({
        colorA: spec.colorA,
        colorB: spec.colorB,
        speed: spec.speed,
        scale: spec.scale,
      });
  }
};

/**
 * Like `applyVideoEffects`, but also returns a `dispose()` that tears down every
 * Insertable-Streams stage (stops each generator and aborts each pipe). The
 * LiveKit adapter (`react-native-webrtc-kaleidoscope/livekit`) uses this so a
 * camera flip (restart) or unpublish (destroy) does not leak generators. The
 * page-shared segmenter and WebGL state are module singletons reused across
 * stages, so they are intentionally NOT torn down here.
 */
export const applyVideoEffectsDisposable = (
  track: MediaStreamTrack,
  effects: ReadonlyArray<EffectInput>,
): DisposablePipeline => {
  if (!track || track.kind !== 'video') {
    throw new Error('kaleidoscope: applyVideoEffects requires a video MediaStreamTrack');
  }
  if (effects.length === 0) {
    return { track, dispose: () => {} };
  }

  let current = track;
  const disposers: Array<() => void> = [];
  for (const input of effects) {
    const spec = toEffectSpec(input);
    const transform = specToTransform(spec);
    const stage = applyEffectToTrack(current, transform);
    current = stage.track;
    disposers.push(stage.dispose);
  }
  return {
    track: current,
    dispose: () => {
      // Tear down in reverse so downstream stages stop before their sources.
      for (const dispose of disposers.reverse()) {
        dispose();
      }
    },
  };
};

export const applyVideoEffects: ApplyVideoEffects = (track, effects) =>
  applyVideoEffectsDisposable(track, effects).track;

/**
 * Bind a track and a preset book, then command presets by name. The headline
 * surface: presets live in the consumer's project, this one verb drives them.
 * On web each command rebuilds the Insertable-Streams pipeline and yields a new
 * output track, so read the live track from the `onTrack` callback (or
 * `session.track`); the session disposes the prior pipeline on each command and
 * on `dispose()`. `applyVideoEffects` remains the lower-level primitive beneath.
 */
export const kaleidoscope = <P extends PresetBook>(
  track: MediaStreamTrack,
  options: KaleidoscopeBindOptions<P>,
): KaleidoscopeSession<P> => {
  let prevDispose = (): void => {};
  const reconcile: Reconcile = {
    apply: (specs) => {
      // Rebuild the whole pipeline from the base track each command, disposing
      // the previous one (generators/pipes) so stages don't leak.
      prevDispose();
      const { track: out, dispose } = applyVideoEffectsDisposable(track, specs);
      prevDispose = dispose;
      return out;
    },
    dispose: () => prevDispose(),
  };
  return createSession(track, options, reconcile);
};
