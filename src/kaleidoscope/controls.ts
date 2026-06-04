// The three-verb controls: shared composite-state machine, platform-agnostic.
//
// Holds the art effect (one composite) and the transform op list, reconciles
// them into an ordered EffectSpec array (art FIRST so segmentation sees the
// upright frame, transform LAST so it reorients the finished composite), and
// applies them through an injected platform `reconcile`. Web rebuilds the
// pipeline and yields a new track (disposing the prior one); native mutates in
// place. `mask` writes the segmentation edge through an injected `setMask`; the
// running composite reads it per frame, so it needs no rebuild.
//
// The art verb is rebuild-aware: switching to a different preset rebuilds, but
// patching the currently-active preset routes through an injected live
// layer-uniform channel (`setLayerUniforms`, keyed by layer id) so a slider drag
// updates the running composite without a rebuild.

import type { EffectSpec, TransformName } from '../types';
import { compositeToEffectSpec } from './shader-to-spec';
import type {
  Composite,
  KaleidoscopeBinding,
  KaleidoscopeBindOptions,
  PresetBook,
  TransformInput,
} from './types';

/** Apply the ordered specs to the base track and return the output. */
export type Reconcile = {
  apply: (specs: ReadonlyArray<EffectSpec>) => MediaStreamTrack;
  dispose: () => void;
};

/** Write the segmentation mask edge (platform tuning channel). */
export type SetMask = (hardness: number, threshold: number) => void;

/**
 * Write a live per-layer uniform override (platform tuning channel), keyed by
 * layer id. The running composite merges these over the layer's baked uniforms
 * each frame, with no rebuild. Mirrors `setMask`.
 */
export type SetLayerUniforms = (
  id: string,
  uniforms: Readonly<Record<string, number | readonly number[]>>,
) => void;

/**
 * Drop every live per-layer override (platform tuning channel). A preset switch
 * calls this so a reused layer id reverts to the new preset's baked uniforms
 * rather than inheriting a stale override from the prior preset.
 */
export type ResetLayerUniforms = () => void;

// Decompose an absolute transform into the discrete ops the pipeline already
// runs (reused on web and native). Flips first, then rotation; rotation snaps to
// the nearest 90°. 180° is two CW steps; 270° is one CCW step.
const decomposeTransform = (t?: TransformInput): EffectSpec[] => {
  if (!t) return [];
  const names: TransformName[] = [];
  if (t.flip?.x) names.push('flip-x');
  if (t.flip?.y) names.push('flip-y');
  const deg = (((Math.round((t.rotate ?? 0) / 90) * 90) % 360) + 360) % 360;
  if (deg === 90) names.push('rotate-cw');
  else if (deg === 180) names.push('rotate-cw', 'rotate-cw');
  else if (deg === 270) names.push('rotate-ccw');
  return names.map((name) => ({ name }));
};

export const createControls = <P extends PresetBook>(
  baseTrack: MediaStreamTrack,
  { presets, onTrack }: KaleidoscopeBindOptions<P>,
  reconcile: Reconcile,
  setMask: SetMask,
  setLayerUniforms: SetLayerUniforms,
  resetLayerUniforms: ResetLayerUniforms,
): KaleidoscopeBinding<P> => {
  let art: EffectSpec | null = null;
  let transformOps: EffectSpec[] = [];
  let current = baseTrack;
  // The id of the active preset (null when cleared). A patch of THIS id routes
  // through the live channel; any other cmd rebuilds.
  let activeId: keyof P | null = null;

  const apply = (): void => {
    const specs: EffectSpec[] = [];
    if (art) specs.push(art);
    specs.push(...transformOps);
    current = reconcile.apply(specs);
    onTrack?.(current);
  };

  return {
    kaleidoscope: (
      cmd: keyof P | null,
      patches?: ReadonlyArray<{
        readonly id: string;
        readonly uniforms: Readonly<Record<string, number | readonly number[]>>;
      }>,
    ) => {
      // Patch the currently-active preset: route through the live no-rebuild
      // channel, keyed by layer id. The `shader` field on a patch is only for
      // narrowing; the channel resolves by `id`.
      if (cmd != null && cmd === activeId && patches && patches.length > 0) {
        for (const patch of patches) {
          setLayerUniforms(patch.id, patch.uniforms);
        }
        return;
      }
      // Switch the preset (or clear): rebuild. Drop every live override first so
      // a reused layer id (e.g. 'blur', shared by the low/medium/high blur
      // presets) takes the new preset's baked uniforms instead of carrying a
      // stale slider override across. A transform rebuild does NOT pass through
      // here, so slider tweaks survive flips/rotations of the active preset.
      activeId = cmd;
      art = cmd == null ? null : compositeToEffectSpec(presets[cmd] as Composite);
      resetLayerUniforms();
      apply();
    },
    transform: (t) => {
      transformOps = decomposeTransform(t);
      apply();
    },
    mask: (m) => {
      // Updates the edge the per-frame composite reads; no pipeline rebuild.
      setMask(m.hardness, m.threshold);
    },
    get track() {
      return current;
    },
    dispose: () => {
      reconcile.dispose();
    },
  };
};
