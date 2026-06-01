// The three-verb controls: shared composite-state machine, platform-agnostic.
//
// Holds the art effect and the transform op list, reconciles them into an
// ordered EffectSpec array (art FIRST so segmentation sees the upright frame,
// transform LAST so it reorients the finished composite), and applies them
// through an injected platform `reconcile`. Web rebuilds the pipeline and
// yields a new track (disposing the prior one); native mutates in place. `mask`
// writes the segmentation edge through an injected `setMask`; the running
// composite reads it per frame, so it needs no rebuild.

import type { EffectSpec, TransformName } from '../types';
import { presetToEffectSpec } from './shader-to-spec';
import type {
  BookEntry,
  KaleidoscopeBindOptions,
  KaleidoscopeControls,
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
): KaleidoscopeControls<P> => {
  let art: EffectSpec | null = null;
  let transformOps: EffectSpec[] = [];
  let current = baseTrack;

  const apply = (): void => {
    const specs: EffectSpec[] = [];
    if (art) specs.push(art);
    specs.push(...transformOps);
    current = reconcile.apply(specs);
    onTrack?.(current);
  };

  return {
    kaleidoscope: (cmd: keyof P | null, opts?: Record<string, unknown>) => {
      art = cmd == null ? null : presetToEffectSpec(presets[cmd] as BookEntry, opts, String(cmd));
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
