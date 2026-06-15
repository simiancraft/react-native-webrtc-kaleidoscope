// Web entry point (source). This builds to `dist/index.web.js`, which web
// bundlers resolve through the package's `browser` export condition. With an
// `exports` map present, that condition supersedes platform-extension
// resolution; the `.web.ts` suffix here is just our source convention, not what
// selects this file at consume time.
//
// Every visual effect is one composite (a layer stack) or one transform. A
// composite wires an Insertable-Streams stage that runs the whole layer stack
// through the compositor and returns a new MediaStreamTrack carrying the
// transformed frames. Pass the returned track to a `<video>` element or to
// `RTCRtpSender.replaceTrack(...)`.

import {
  applyEffectToTrack,
  type DisposablePipeline,
  type FrameTransform,
  makeComposite,
  makeTransform,
  resetLayerUniforms as resetCompositeLayerUniforms,
  setLayerUniforms as setCompositeLayerUniforms,
  tuning,
} from '../web-driver';
import {
  createControls,
  type Reconcile,
  type ResetLayerUniforms,
  type SetLayerUniforms,
  type SetMask,
} from './kaleidoscope/controls';
import { toEffectSpec } from './kaleidoscope/effect';
import type { EffectInput, EffectSpec } from './kaleidoscope/effect.types';
import type { KaleidoscopeBinding, KaleidoscopeBindOptions } from './kaleidoscope/types';
import type { KaleidoscopePresetBook } from './kaleidoscope.preset-book.types';

// The tuning channel (tuning.*) is internal: the mask edge flows from the mask()
// verb (see bindKaleidoscope). Per-layer uniform tuning flows from the
// kaleidoscope verb's patch path into the composite compositor's live channel. The
// old global set* exports are gone; effects are driven by kaleidoscope /
// transform / mask, not loose setters.

export type { CatalogImageId } from '../catalog/images';
export type {
  AnamorphicLensFlareUniforms,
  BlurUniforms,
  CloudsUniforms,
  CorporateBlobsUniforms,
  FirefliesUniforms,
  GodraysUniforms,
  LayerShaderName,
  LayerShaderOptions,
  LightBeamsAndMotesUniforms,
  NebulaUniforms,
  PatchableShaderName,
  PlasmaUniforms,
  ShaderUniformsMap,
  SimianlightsUniforms,
  UniformControl,
} from '../catalog/shaders';
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
} from '../catalog/shaders';
export type {
  CompositeSpec,
  EffectInput,
  EffectName,
  EffectSpec,
  TransformName,
  TransformSpec,
} from './kaleidoscope/effect.types';
export type {
  KaleidoscopeBinding,
  KaleidoscopeBindOptions,
  MaskInput,
  PatchesFor,
  PatchFor,
  TransformInput,
} from './kaleidoscope/types';
export type {
  KaleidoscopeBlendMode,
  KaleidoscopeControls,
  KaleidoscopeLayer,
  KaleidoscopeLayerTarget,
  KaleidoscopePreset,
  KaleidoscopePresetBook,
  KaleidoscopePresetEntry,
  KaleidoscopeTaxonomy,
} from './kaleidoscope.preset-book.types';
export type { RGB } from './lib/primitives.types';

const specToTransform = (spec: EffectSpec): FrameTransform => {
  switch (spec.name) {
    case 'flip-x':
    case 'flip-y':
    case 'rotate-cw':
    case 'rotate-ccw':
      return makeTransform(spec.name);
    case 'composite':
      // The layer stack runs as a single compositor stage (painter's order,
      // per-layer blend), not a serial chain of replace-stages. Blur, image, and
      // generative layers all live inside it.
      return makeComposite(spec.layers);
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

/**
 * Bind a track and a preset book; get the four verbs back
 * (`{ kaleidoscope, transform, mask }`). Presets live in the consumer's
 * project; these verbs drive them. On web each `kaleidoscope` preset switch and
 * each `transform` command rebuilds the Insertable-Streams pipeline and yields a
 * new output track, so read the live track from `onTrack` (or `controls.track`);
 * the prior pipeline is disposed each command and on `dispose()`. A `kaleidoscope`
 * patch of the active preset and `mask` both update what the running pipeline
 * reads per frame (no rebuild).
 */
export const bindKaleidoscope = <P extends KaleidoscopePresetBook>(
  track: MediaStreamTrack,
  options: KaleidoscopeBindOptions<P>,
): KaleidoscopeBinding<P> => {
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
  // Live per-layer uniform channel: a patch of the active preset writes here
  // (keyed by layer id) and the running compositor merges it each frame.
  const setLayerUniforms: SetLayerUniforms = (id, uniforms) => {
    setCompositeLayerUniforms(id, uniforms);
  };
  // A preset switch drops every live override so reused layer ids revert to the
  // new preset's baked uniforms (see createControls).
  const resetLayerUniforms: ResetLayerUniforms = () => {
    resetCompositeLayerUniforms();
  };
  return createControls(track, options, reconcile, setMask, setLayerUniforms, resetLayerUniforms);
};
