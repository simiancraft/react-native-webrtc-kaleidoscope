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
  setSegmentationTargetShortSide: (value: number) => void;
  setDebugTiming: (value: boolean) => void;
  resetEffectTuning: () => void;
}

// Lazy because the module is not available during pure-JS tests; the
// getter throws if you call a setter outside a real native runtime, which
// is the right failure mode.
const nativeModule = (): KaleidoscopeNativeModule =>
  requireNativeModule<KaleidoscopeNativeModule>('RnWebrtcKaleidoscope');

/**
 * Set the Gaussian sigma for the blur effect. Higher = softer blur.
 * Clamped to [0.5, 7] (the useful range before the linear-sampled kernel
 * truncates and bands). Default 5.
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
 * lower values are more inclusive. Optimal value is platform-specific:
 * all three platforms run MediaPipe selfie segmentation, but the input
 * downscale and API variant differ and produce different confidence
 * distributions.
 */
export const setMaskThreshold = (value: number): void => {
  nativeModule().setMaskThreshold(value);
};

/**
 * Set the segmentation input short-side (px). The person mask is computed from
 * an input downscaled to this; lower = cheaper segmentation (helps on older
 * devices like the A11), softer mask edge. Default 384, clamped [128, 1080]
 * identically on both native platforms. Native only; the web pipeline ignores it.
 */
export const setSegmentationTargetShortSide = (value: number): void => {
  nativeModule().setSegmentationTargetShortSide(value);
};

/**
 * Toggle native per-frame GPU/segmentation timing logs (off by default). iOS
 * logs under os_log "Perf"; Android under the "Perf" logcat tag.
 */
export const setDebugTiming = (value: boolean): void => {
  nativeModule().setDebugTiming(value);
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
  PlasmaSpec,
  RGB,
  TransformName,
  TransformSpec,
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
// The four geometric transform ops share one native processor per platform
// (TransformFactory on Android, TransformProcessor on iOS); each is a flat name.
const TRANSFORM_EFFECTS: readonly string[] = ['flip-x', 'flip-y', 'rotate-cw', 'rotate-ccw'];

// Android (Registration.kt) and iOS (Registration.swift) install an identical
// effect set, so one list covers both natives. If the platforms ever diverge,
// split this back into per-platform lists keyed off Platform.OS.
const NATIVE_REGISTERED_EFFECTS_LIST: readonly string[] = [
  ...TRANSFORM_EFFECTS,
  'blur',
  ...BACKGROUND_PRESETS.map((name) => `background-image-${name}`),
];

const registeredForPlatform = (): readonly string[] =>
  Platform.OS === 'android' || Platform.OS === 'ios' ? NATIVE_REGISTERED_EFFECTS_LIST : [];

const NATIVE_REGISTERED_EFFECTS: ReadonlySet<string> = new Set(registeredForPlatform());

const specToNativeName = (spec: ReturnType<typeof toEffectSpec>): string => {
  // background-image uses one registered factory per source preset.
  // {name: 'background-image', source: 'dark-office'} -> 'background-image-dark-office'
  if (spec.name === 'background-image') {
    return `background-image-${spec.source}`;
  }
  return spec.name;
};

// Last effect set applied to each track, as a stable signature. Used to skip
// redundant native calls: rn-webrtc rebuilds the native frame processors on
// EVERY _setVideoEffects call (Android constructs a fresh processor per call),
// so re-issuing an unchanged set (a React re-render, an idempotent effect
// hook) churns GL + segmentation resources for no reason. The WeakMap lets the
// entry be collected when the track is.
const lastAppliedSignatureByTrack = new WeakMap<object, string>();

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
  const specs = effects.map(toEffectSpec);
  // Route per-spec parameters through the effect-tuning side-channel before
  // applying. Upstream's `_setVideoEffects(names)` has no argument slot, so
  // parameters reach the native processors via the Expo Module's tuning
  // functions, which the per-frame processors already read each frame. For the
  // single-active-art-axis model a global value is correct (only one blur is
  // ever active). The setter is idempotent, so it runs before the dedup gate.
  for (const spec of specs) {
    if (spec.name === 'blur' && spec.sigma != null) {
      nativeModule().setBlurSigma(spec.sigma);
    }
  }
  const allNames = specs.map(specToNativeName);
  const names = allNames.filter((n) => NATIVE_REGISTERED_EFFECTS.has(n));

  // Dedup against the last set applied to this track. Order is significant
  // (effects chain in array order), so the signature preserves it. Skip the
  // native call when nothing changed; the first call for any given set always
  // proceeds (no prior entry).
  const signature = names.join('\n');
  if (lastAppliedSignatureByTrack.get(track) === signature) {
    return track;
  }
  lastAppliedSignatureByTrack.set(track, signature);

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
