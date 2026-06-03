// Native entry point. Metro picks this up via package.json "react-native"
// and the "." subpath export's "react-native" condition.
//
// Thin facade over `track._setVideoEffects(names)` from react-native-webrtc.
// Native frame processors are registered at app boot by the Expo Module's
// OnCreate hook (see android/.../KaleidoscopeModule.kt and ios/.../KaleidoscopeModule.swift);
// this facade just dispatches into the existing upstream registry.

import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import {
  createControls,
  type Reconcile,
  type ResetLayerUniforms,
  type SetLayerUniforms,
  type SetMask,
} from './kaleidoscope/controls';
import type {
  KaleidoscopeBindOptions,
  KaleidoscopeControls,
  PresetBook,
} from './kaleidoscope/types';
import { type ApplyVideoEffects, type CompositeSpec, type LayerSpec, toEffectSpec } from './types';

// The native module's tuning functions. Only the three the JS layer drives are
// declared: blur sigma (from a blur preset's options) and the mask edge (from
// the mask() verb). The native module also exposes segmentation/debug/reset
// functions, but nothing in JS calls them anymore, so they're not declared here.
interface KaleidoscopeNativeModule {
  setMaskHardness: (value: number) => void;
  setMaskThreshold: (value: number) => void;
  // Composite layer-stack channel. Optional: a native build predating the
  // compositor won't expose it, so callers guard with `?.`. JS sends the active
  // composite's ordered layer stack as a JSON string; native parses + composites
  // it. Blur sigma and generative uniforms now ride inside each layer's
  // `uniforms`, so there is no separate setBlurSigma/setShaderUniforms channel.
  setCompositeLayers?: (json: string) => void;
}

// Lazy because the module is not available during pure-JS tests; the
// getter throws if you call a setter outside a real native runtime, which
// is the right failure mode.
const nativeModule = (): KaleidoscopeNativeModule =>
  requireNativeModule<KaleidoscopeNativeModule>('RnWebrtcKaleidoscope');

// The native tuning functions (setMaskHardness / setMaskThreshold) remain on the
// native module and are called internally: the mask edge flows from the mask()
// verb (see bindKaleidoscope). The composite layer stack flows through
// setCompositeLayers. The old global set* JS exports are gone; effects are driven by
// kaleidoscope / transform / mask, not loose setters.

export type { BackgroundPresetName } from '../images';
export type {
  Composite,
  KaleidoscopeBindOptions,
  KaleidoscopeControls,
  KaleidoscopeControlsProps,
  MaskInput,
  PatchesFor,
  PatchFor,
  Preset,
  PresetBook,
  Taxonomy,
  TransformInput,
} from './kaleidoscope/types';
export type {
  AnamorphicLensFlareUniforms,
  BlurUniforms,
  CloudsUniforms,
  CorporateBlobsUniforms,
  FirefliesUniforms,
  GodraysUniforms,
  LightBeamsAndMotesUniforms,
  NebulaUniforms,
  PatchableShaderName,
  PlasmaUniforms,
  ShaderUniformsMap,
  SimianlightsUniforms,
  UniformControl,
} from './shaders';
// Per-shader control descriptors (platform-agnostic data). Imported individually
// per the shader a preset's layer uses; there is no all-shaders aggregate.
export {
  ANAMORPHIC_LENSFLARE_CONTROLS,
  BLUR_CONTROLS,
  CLOUDS_CONTROLS,
  CORPORATE_BLOBS_CONTROLS,
  defaultUniforms,
  FIREFLIES_CONTROLS,
  GODRAYS_CONTROLS,
  LIGHT_BEAMS_AND_MOTES_CONTROLS,
  NEBULA_CONTROLS,
  PLASMA_CONTROLS,
  SIMIANLIGHTS_CONTROLS,
} from './shaders';
export type {
  BlendMode,
  CompositeSpec,
  EffectInput,
  EffectName,
  EffectSpec,
  LayerShaderName,
  LayerShaderOptions,
  LayerSpec,
  LayerTarget,
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
// EglRenderer crashes one frame later). Dropping an unregistered name here is
// the safe behavior.
//
// The art axis is now one registered "composite" compositor: blur, images, and
// generative shaders are all layers inside it, delivered out-of-band via
// setCompositeLayers. The four geometric transform ops share one native processor
// per platform (TransformFactory on Android, TransformProcessor on iOS); each is
// a flat name. iOS registers the same set via ios/.../Registration.swift.
const TRANSFORM_EFFECTS: readonly string[] = ['flip-x', 'flip-y', 'rotate-cw', 'rotate-ccw'];

// Android (Registration.kt) and iOS (Registration.swift) install an identical
// effect set, so one list covers both natives. If the platforms ever diverge,
// split this back into per-platform lists keyed off Platform.OS.
const NATIVE_REGISTERED_EFFECTS_LIST: readonly string[] = [...TRANSFORM_EFFECTS, 'composite'];

const registeredForPlatform = (): readonly string[] =>
  Platform.OS === 'android' || Platform.OS === 'ios' ? NATIVE_REGISTERED_EFFECTS_LIST : [];

const NATIVE_REGISTERED_EFFECTS: ReadonlySet<string> = new Set(registeredForPlatform());

// Serialize a composite's layer stack to the JSON shape the native CompositeLayers
// channel parses: an array of { id, shader, target, blend?, source?, uniforms? }.
// Every layer carries its `id`. An `image` layer's native `source` IS its `id`
// (the bundled WebP basename the prebuild plugin copied under that name); all
// other layers carry their uniforms.
const serializeCompositeLayers = (layers: ReadonlyArray<LayerSpec>): string => {
  const wire = layers.map((layer) => {
    const base: Record<string, unknown> = {
      id: layer.id,
      shader: layer.shader,
      target: layer.target ?? 'background',
    };
    if (layer.blend != null) base.blend = layer.blend;
    if (layer.shader === 'image') {
      // The layer id is the plate id (the bundled WebP basename); the native
      // compositor resolves assets/images/<id>.webp from it.
      base.source = layer.id;
    } else if ('uniforms' in layer) {
      base.uniforms = layer.uniforms;
    }
    return base;
  });
  return JSON.stringify(wire);
};

const specToNativeName = (spec: ReturnType<typeof toEffectSpec>): string => {
  // The composite runs through the single registered "composite" compositor; its
  // layer stack is delivered out-of-band via setCompositeLayers (see applyVideoEffects).
  if (spec.name === 'composite') {
    return 'composite';
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

// The lower-level native primitive: route a spec array through the upstream
// `_setVideoEffects`. Internal now (the public surface is the three verbs);
// `bindKaleidoscope`'s reconcile drives it.
const applyVideoEffects: ApplyVideoEffects = (track, effects) => {
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
  // Deliver the composite's layer stack out-of-band before the "composite" name
  // is dispatched. Blur sigma and generative uniforms ride inside each layer's
  // `uniforms`. Guarded: a native build without the compositor lacks the function
  // (and drops the "composite" name below if not registered).
  for (const spec of specs) {
    if (spec.name === 'composite') {
      nativeModule().setCompositeLayers?.(serializeCompositeLayers((spec as CompositeSpec).layers));
    }
  }
  // The composite name is book-driven: the prebuild copied the plates and native
  // registration installed the one "composite" compositor, so it passes the
  // crash-guard. Transforms must be in the static set (always are).
  const mapped = specs.map((spec) => ({
    name: specToNativeName(spec),
    trusted: spec.name === 'composite',
  }));
  const names = mapped
    .filter((m) => m.trusted || NATIVE_REGISTERED_EFFECTS.has(m.name))
    .map((m) => m.name);

  // Dedup against the last set applied to this track. Order is significant
  // (effects chain in array order), so the signature preserves it. Skip the
  // native call when nothing changed; the first call for any given set always
  // proceeds (no prior entry).
  const signature = names.join('\n');
  if (lastAppliedSignatureByTrack.get(track) === signature) {
    return track;
  }
  lastAppliedSignatureByTrack.set(track, signature);

  const dropped = mapped
    .filter((m) => !m.trusted && !NATIVE_REGISTERED_EFFECTS.has(m.name))
    .map((m) => m.name);
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

/**
 * Bind a track and a preset book; get the three verbs back
 * (`{ kaleidoscope, transform, mask }`). On native the track is mutated in
 * place, so `controls.track` is the bound track and `onTrack` fires with it
 * after each `kaleidoscope` preset switch and `transform` command. `mask`
 * updates the segmentation edge the per-frame processors read.
 */
export const bindKaleidoscope = <P extends PresetBook>(
  track: MediaStreamTrack,
  options: KaleidoscopeBindOptions<P>,
): KaleidoscopeControls<P> => {
  const reconcile: Reconcile = {
    apply: (specs) => applyVideoEffects(track, specs),
    dispose: () => {},
  };
  const setMask: SetMask = (hardness, threshold) => {
    nativeModule().setMaskHardness(hardness);
    nativeModule().setMaskThreshold(threshold);
  };
  // Native has no live per-layer uniform channel yet (Phase B): a patch of the
  // active preset is a no-op here, so the verb's patch path is inert on native
  // until the compositor reads layer-id-keyed overrides. The verb still drives
  // preset switches through reconcile.
  const setLayerUniforms: SetLayerUniforms = () => {};
  // Native re-sends the full layer stack (with baked uniforms) on every preset
  // switch via setCompositeLayers, so there is no stale override to clear; no-op for
  // parity with the inert setLayerUniforms above.
  const resetLayerUniforms: ResetLayerUniforms = () => {};
  return createControls(track, options, reconcile, setMask, setLayerUniforms, resetLayerUniforms);
};
