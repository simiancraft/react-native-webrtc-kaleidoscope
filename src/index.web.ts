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

import { createControls, type Reconcile, type SetMask } from './kaleidoscope/controls';
import type {
  KaleidoscopeBindOptions,
  KaleidoscopeControls,
  PresetBook,
} from './kaleidoscope/types';
import { type ApplyVideoEffects, type EffectInput, type EffectSpec, toEffectSpec } from './types';
import { makeBackgroundImage } from './web/effects/background-image';
import { blur } from './web/effects/blur';
import { makeScene } from './web/effects/scene';
import { makeShaderEffect } from './web/effects/shader-effect';
import { makeTransform } from './web/effects/transform';
import {
  applyEffectToTrack,
  type DisposablePipeline,
  type FrameTransform,
} from './web/insertable-streams';
import { SHADER_SOURCES } from './web/shaders';
import { tuning } from './web/tuning';

// The tuning channel (tuning.*) is internal now: blur sigma flows from a blur
// preset's options via specToTransform, and the mask edge flows from the mask()
// verb (see bindKaleidoscope). The old global set* exports are gone; effects are
// driven by kaleidoscope / transform / mask, not loose setters.

export type { BackgroundPresetName } from './backgrounds';
export type {
  KaleidoscopeBindOptions,
  KaleidoscopeControls,
  MaskInput,
  Preset,
  PresetBook,
  ShaderName,
  ShaderOptionsMap,
  TransformInput,
} from './kaleidoscope/types';
export type {
  AnamorphicLensFlareUniforms,
  BeamsAndMotesUniforms,
  CloudsUniforms,
  FirefliesUniforms,
  GodraysUniforms,
  NebulaUniforms,
  PlasmaUniforms,
  SimianlightsUniforms,
  UniformControl,
} from './shaders';
export {
  ANAMORPHIC_LENSFLARE_CONTROLS,
  BEAMS_AND_MOTES_CONTROLS,
  CLOUDS_CONTROLS,
  FIREFLIES_CONTROLS,
  GODRAYS_CONTROLS,
  LAYER_CONTROLS,
  NEBULA_CONTROLS,
  PLASMA_CONTROLS,
  SIMIANLIGHTS_CONTROLS,
} from './shaders';
export type {
  ApplyVideoEffects,
  BackgroundImageSpec,
  BlurSpec,
  EffectInput,
  EffectName,
  EffectSpec,
  RGB,
  ShaderSpec,
  TransformName,
  TransformSpec,
} from './types';
// Live layer-uniform tuning channel (web) + the clouds control descriptor the
// demo generates tuning controls from.
export { clearLayerUniforms, setLayerUniforms } from './web/effects/scene';

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
    case 'shader': {
      // Any generative shader: look up its source by name from the codegen
      // registry and run it through the generic processor with the spec's
      // uniforms. No per-shader code — adding a shader adds a registry entry.
      const src = SHADER_SOURCES[spec.shader];
      if (!src) throw new Error(`kaleidoscope: unknown shader '${spec.shader}'`);
      return makeShaderEffect(src, spec.uniforms);
    }
    case 'scene':
      // A composed scene: the layer stack runs as a single compositor stage
      // (painter's order, per-layer blend), not a serial chain of replace-stages.
      return makeScene(spec.layers);
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
 * Bind a track and a preset book; get the three verbs back
 * (`{ kaleidoscope, transform, mask }`). Presets live in the consumer's
 * project; these verbs drive them. On web each `kaleidoscope`/`transform`
 * command rebuilds the Insertable-Streams pipeline and yields a new output
 * track, so read the live track from `onTrack` (or `controls.track`); the prior
 * pipeline is disposed each command and on `dispose()`. `mask` updates the
 * segmentation edge the running pipeline reads per frame (no rebuild).
 * `applyVideoEffects` remains the lower-level primitive beneath.
 */
export const bindKaleidoscope = <P extends PresetBook>(
  track: MediaStreamTrack,
  options: KaleidoscopeBindOptions<P>,
): KaleidoscopeControls<P> => {
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
  const setMask: SetMask = (hardness, threshold) => {
    tuning.setMaskHardness(hardness);
    tuning.setMaskThreshold(threshold);
  };
  return createControls(track, options, reconcile, setMask);
};
