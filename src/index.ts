// Native entry point. Metro picks this up via package.json "react-native"
// and the "." subpath export's "react-native" condition.
//
// Thin facade over `track._setVideoEffects(names)` from react-native-webrtc.
// Native frame processors are registered at app boot by the Expo Module's
// OnCreate hook (see android/.../KaleidoscopeModule.kt and ios/.../KaleidoscopeModule.swift);
// this facade just dispatches into the existing upstream registry.

import type { ApplyVideoEffects } from './types';

export type { ApplyVideoEffects, EffectName } from './types';

interface WebRTCTrackExtensions {
  remote?: boolean;
  _setVideoEffects?: (names: ReadonlyArray<string>) => void;
}

export const applyVideoEffects: ApplyVideoEffects = (track, names) => {
  const t = track as MediaStreamTrack & WebRTCTrackExtensions;
  if (t.remote) {
    throw new Error('kaleidoscope: cannot apply effects to remote tracks');
  }
  if (typeof t._setVideoEffects !== 'function') {
    throw new Error(
      'kaleidoscope: track has no _setVideoEffects method (is react-native-webrtc >=124 installed?)',
    );
  }
  t._setVideoEffects(names);
  return track;
};
