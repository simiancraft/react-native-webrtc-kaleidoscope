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

import { type ApplyVideoEffects, type EffectSpec, toEffectSpec } from './types';
import { makeBackgroundImage } from './web/effects/background-image';
import { blur } from './web/effects/blur';
import { mirror } from './web/effects/mirror';
import { passthrough } from './web/effects/passthrough';
import { applyEffectToTrack, type FrameTransform } from './web/insertable-streams';
import { tuning } from './web/tuning';

/**
 * Set the Gaussian sigma for the blur effect. Higher = softer blur.
 * Clamped to [0.5, 64]. Default 8.
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
 * Reset all effect tuning parameters to library defaults.
 */
export const resetEffectTuning = (): void => {
  tuning.reset();
};

export type { BackgroundPresetName } from './backgrounds';
export type {
  ApplyVideoEffects,
  BackgroundImageSpec,
  BlurSpec,
  EffectInput,
  EffectName,
  EffectSpec,
  MirrorSpec,
  PassthroughSpec,
} from './types';

const specToTransform = (spec: EffectSpec): FrameTransform => {
  switch (spec.name) {
    case 'mirror':
      return mirror;
    case 'blur':
      // Blur ignores the spec parameters for v0.1; defaults are baked into
      // the shader. Uniform-driven sigma lands when we wire params end-to-end.
      return blur;
    case 'background-image':
      return makeBackgroundImage(spec.source);
    case 'gpu-passthrough':
      return passthrough;
  }
};

export const applyVideoEffects: ApplyVideoEffects = (track, effects) => {
  if (!track || track.kind !== 'video') {
    throw new Error('kaleidoscope: applyVideoEffects requires a video MediaStreamTrack');
  }
  if (effects.length === 0) {
    return track;
  }

  let current = track;
  for (const input of effects) {
    const spec = toEffectSpec(input);
    const transform = specToTransform(spec);
    current = applyEffectToTrack(current, transform);
  }
  return current;
};
