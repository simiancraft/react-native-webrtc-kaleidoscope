// Native entry point. Metro picks this up via package.json "react-native"
// and the "." subpath export's "react-native" condition.
//
// Thin facade over `track._setVideoEffects(names)` from react-native-webrtc.
// Native frame processors are registered at app boot by the Expo Module's
// OnCreate hook (see android/.../KaleidoscopeModule.kt and ios/.../KaleidoscopeModule.swift);
// this facade just dispatches into the existing upstream registry.

import { Platform } from 'react-native';
import { BACKGROUND_PRESETS } from './backgrounds';
import { type ApplyVideoEffects, toEffectSpec } from './types';

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

interface WebRTCTrackExtensions {
  remote?: boolean;
  // Upstream's typed signature is `string[]`, but the native bridge also
  // accepts null and takes the `videoSource.setVideoProcessor(null)` branch,
  // which is the only correct way to clear effects. See note below.
  _setVideoEffects?: (names: ReadonlyArray<string> | null) => void;
}

// Effect names registered native-side in Registration.kt / Registration.swift.
// Anything not in this list gets filtered out before reaching upstream,
// because rn-webrtc's setVideoEffects calls ProcessorProvider.getProcessor()
// and filters nulls into an empty list, which then hits the
// VideoEffectProcessor empty-processors-list bug (refcount goes negative,
// EglRenderer crashes one frame later). Until each effect ships a native
// factory, dropping its name here is the safe behavior.
//
// Background-image preset names come from src/backgrounds.ts; the encoder
// turns `{name:'background-image', source:'office-1'}` into the flat-string
// `'background-image-office-1'` because the rn-webrtc native registry is
// keyed by flat strings (parameterization via uniforms is a follow-up).
//
// iOS native processors are not yet ported; ios/.../Registration.swift is a
// no-op until they land. Until then, the iOS allowlist is empty so consumers
// get a console.warn (instead of an empty-processors-list crash) when an
// effect is requested on iOS.
const ANDROID_REGISTERED_EFFECTS: readonly string[] = [
  'mirror',
  'blur',
  'gpu-passthrough',
  ...BACKGROUND_PRESETS.map((name) => `background-image-${name}`),
];

const NATIVE_REGISTERED_EFFECTS: ReadonlySet<string> = new Set(
  Platform.OS === 'android' ? ANDROID_REGISTERED_EFFECTS : [],
);

const specToNativeName = (spec: ReturnType<typeof toEffectSpec>): string => {
  // background-image uses one registered factory per source preset.
  // {name: 'background-image', source: 'office-1'} -> 'background-image-office-1'
  if (spec.name === 'background-image') {
    return `background-image-${spec.source}`;
  }
  return spec.name;
};

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
  // sigma, etc.) are dropped here; they wire through in a follow-up commit
  // once the GPU effects accept uniforms.
  const allNames = effects.map((e) => specToNativeName(toEffectSpec(e)));
  const names = allNames.filter((n) => NATIVE_REGISTERED_EFFECTS.has(n));
  const dropped = allNames.filter((n) => !NATIVE_REGISTERED_EFFECTS.has(n));
  if (dropped.length > 0) {
    console.warn(
      `kaleidoscope: dropping effects not registered on this native platform: ${dropped.join(', ')}. ` +
        'Web has its own registry; this is a native-only filter.',
    );
  }
  // rn-webrtc 124 has a bug where passing [] installs a VideoEffectProcessor
  // with an empty processors list, and its onFrameCaptured then double-releases
  // the input frame (retain once, release twice) which crashes the renderer.
  // Passing null takes the upstream else-branch that clears the processor
  // entirely. We translate at the boundary so consumers keep a clean array
  // API and never see the workaround.
  t._setVideoEffects(names.length === 0 ? null : names);
  return track;
};
