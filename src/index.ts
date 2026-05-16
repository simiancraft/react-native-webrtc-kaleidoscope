// Native entry point. Metro picks this up via package.json "react-native"
// and the "." subpath export's "react-native" condition.
//
// Thin facade over `track._setVideoEffects(names)` from react-native-webrtc.
// Native frame processors are registered at app boot by the Expo Module's
// OnCreate hook (see android/.../KaleidoscopeModule.kt and ios/.../KaleidoscopeModule.swift);
// this facade just dispatches into the existing upstream registry.

import { type ApplyVideoEffects, toEffectSpec } from './types';

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

interface WebRTCTrackExtensions {
  remote?: boolean;
  // Upstream's typed signature is `string[]`, but the native bridge also
  // accepts null and takes the `videoSource.setVideoProcessor(null)` branch,
  // which is the only correct way to clear effects. See note below.
  _setVideoEffects?: (names: ReadonlyArray<string> | null) => void;
}

export const applyVideoEffects: ApplyVideoEffects = (track, effects) => {
  const t = track as MediaStreamTrack & WebRTCTrackExtensions;
  if (t.remote) {
    throw new Error('kaleidoscope: cannot apply effects to remote tracks');
  }
  if (typeof t._setVideoEffects !== 'function') {
    throw new Error(
      'kaleidoscope: track has no _setVideoEffects method (is react-native-webrtc >=124 installed?)',
    );
  }
  // Native side currently only consumes effect names. Spec parameters (blur
  // sigma, background-image source) are dropped here; they wire through in a
  // follow-up commit once the GPU effects accept uniforms.
  const names = effects.map((e) => toEffectSpec(e).name);
  // rn-webrtc 124 has a bug where passing [] installs a VideoEffectProcessor
  // with an empty processors list, and its onFrameCaptured then double-releases
  // the input frame (retain once, release twice) which crashes the renderer.
  // Passing null takes the upstream else-branch that clears the processor
  // entirely. We translate at the boundary so consumers keep a clean array
  // API and never see the workaround.
  t._setVideoEffects(names.length === 0 ? null : names);
  return track;
};
