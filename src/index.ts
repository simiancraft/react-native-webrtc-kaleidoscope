// Native entry point. Metro picks this up via package.json "react-native"
// and the "." subpath export's "react-native" condition.
//
// Thin facade over `track._setVideoEffects(names)` from react-native-webrtc.
// Native frame processors are registered at app boot by the Expo Module's
// OnCreate hook (see android/.../KaleidoscopeModule.kt and ios/.../KaleidoscopeModule.swift);
// this facade just dispatches into the existing upstream registry.

import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { BACKGROUND_PRESETS } from './backgrounds';
import { type ApplyVideoEffects, toEffectSpec } from './types';

interface KaleidoscopeNativeModule {
  setBlurSigma: (value: number) => void;
  setMaskHardness: (value: number) => void;
  setMaskThreshold: (value: number) => void;
  resetEffectTuning: () => void;
}

// Lazy because the module is not available during pure-JS tests; the
// getter throws if you call a setter outside a real native runtime, which
// is the right failure mode.
const nativeModule = (): KaleidoscopeNativeModule =>
  requireNativeModule<KaleidoscopeNativeModule>('RnWebrtcKaleidoscope');

/**
 * Set the Gaussian sigma for the blur effect. Higher = softer blur.
 * Clamped to [0.5, 64] native-side. Default 8.
 */
export const setBlurSigma = (value: number): void => {
  nativeModule().setBlurSigma(value);
};

/**
 * Set the mask smoothstep hardness for blur and background-image
 * composites, in [0, 1]. 0 = soft halo, 1 = near-step edge. Default 0.5.
 */
export const setMaskHardness = (value: number): void => {
  nativeModule().setMaskHardness(value);
};

/**
 * Set the mask smoothstep threshold (center of the transition) in
 * [0.05, 0.95]. 0.5 is neutral. Higher values reject low-confidence
 * pixels (helps tighten the silhouette against chair-edge noise);
 * lower values are more inclusive. Optimal value is platform-specific
 * because each segmentation model (MediaPipe on web, MLKit on Android,
 * Vision on iOS) produces a different confidence distribution.
 */
export const setMaskThreshold = (value: number): void => {
  nativeModule().setMaskThreshold(value);
};

/**
 * Reset all effect tuning parameters to library defaults.
 */
export const resetEffectTuning = (): void => {
  nativeModule().resetEffectTuning();
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
} from './types';

interface WebRTCTrackExtensions {
  remote?: boolean;
  // Upstream's typed signature is `string[]`, but the platforms diverge on
  // how to clear effects:
  //   - Android: passing `null` takes the
  //     `videoSource.setVideoProcessor(null)` branch (the only correct clear
  //     path); passing `[]` crashes EglRenderer.
  //   - iOS: the Obj-C method declares `names` as `nonnull NSArray<NSString *>`,
  //     so `null` violates the bridge contract; `[]` is the supported clear
  //     value (iOS's `VideoEffectProcessor` with no processors is a
  //     passthrough).
  // We type the parameter as the union so the facade can platform-split at
  // the call site. See `applyVideoEffects` below.
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
// turns `{name:'background-image', source:'dark-office'}` into the flat-string
// `'background-image-dark-office'` because the rn-webrtc native registry is
// keyed by flat strings (parameterization via uniforms is a follow-up).
//
// iOS registers the same effects via ios/.../Registration.swift. Each
// platform's allowlist matches exactly what its native Registration installs;
// anything else is filtered out before reaching upstream so a name with no
// registered processor never triggers the empty-processors-list crash.
const ANDROID_REGISTERED_EFFECTS: readonly string[] = [
  'mirror',
  'blur',
  ...BACKGROUND_PRESETS.map((name) => `background-image-${name}`),
];

const IOS_REGISTERED_EFFECTS: readonly string[] = [
  'mirror',
  'blur',
  ...BACKGROUND_PRESETS.map((name) => `background-image-${name}`),
];

const registeredForPlatform = (): readonly string[] => {
  if (Platform.OS === 'android') return ANDROID_REGISTERED_EFFECTS;
  if (Platform.OS === 'ios') return IOS_REGISTERED_EFFECTS;
  return [];
};

const NATIVE_REGISTERED_EFFECTS: ReadonlySet<string> = new Set(registeredForPlatform());

const specToNativeName = (spec: ReturnType<typeof toEffectSpec>): string => {
  // background-image uses one registered factory per source preset.
  // {name: 'background-image', source: 'dark-office'} -> 'background-image-dark-office'
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
  // Platforms diverge on how to clear effects:
  //   - Android: rn-webrtc 124 has a bug where passing `[]` installs a
  //     VideoEffectProcessor with an empty processors list, whose
  //     onFrameCaptured then double-releases the input frame (retain once,
  //     release twice) and crashes EglRenderer one frame later. The only
  //     correct clear is `null`, which takes the upstream else-branch that
  //     resets the processor via `videoSource.setVideoProcessor(null)`.
  //   - iOS: the upstream Obj-C `_setVideoEffects` method declares
  //     `names` as `(nonnull NSArray<NSString *> *)`, so passing `null`
  //     violates the React Native bridge's nonnull contract. The supported
  //     clear value is `[]`, which iOS's VideoEffectProcessor treats as a
  //     passthrough (no double-release bug on this platform).
  // The explicit type annotation is required — without it TS widens the
  // empty-array literal to `never[] | null`.
  const clearValue: ReadonlyArray<string> | null = Platform.OS === 'ios' ? [] : null;
  t._setVideoEffects(names.length === 0 ? clearValue : names);
  return track;
};
