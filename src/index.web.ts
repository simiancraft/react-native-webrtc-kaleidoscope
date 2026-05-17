// Web entry point. Metro's `.web.ts` resolution picks this up over `index.ts`
// when an Expo app builds for the web target.
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
