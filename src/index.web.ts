// Web entry point. Metro's `.web.ts` resolution picks this up over `index.ts`
// when an Expo app builds for the web target.
//
// applyVideoEffects(track, names) wires an Insertable-Streams pipeline that
// chains each named effect's transform and returns a new MediaStreamTrack
// carrying the transformed frames. Pass the returned track to a `<video>`
// element or to `RTCRtpSender.replaceTrack(...)`.

import type { ApplyVideoEffects, EffectName } from './types';
import { blur } from './web/effects/blur';
import { mirror } from './web/effects/mirror';
import { applyEffectToTrack, type FrameTransform } from './web/insertable-streams';

export type { ApplyVideoEffects, EffectName } from './types';

const transforms: Record<EffectName, FrameTransform> = {
  mirror,
  blur,
};

export const applyVideoEffects: ApplyVideoEffects = (track, names) => {
  if (!track || track.kind !== 'video') {
    throw new Error('kaleidoscope: applyVideoEffects requires a video MediaStreamTrack');
  }
  if (names.length === 0) {
    return track;
  }

  let current = track;
  for (const name of names) {
    const transform = transforms[name];
    if (!transform) {
      throw new Error(`kaleidoscope: unknown effect "${name}"`);
    }
    current = applyEffectToTrack(current, transform);
  }
  return current;
};
