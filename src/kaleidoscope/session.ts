// The kaleidoscope() session: shared composite-state machine, platform-agnostic.
//
// Holds one effect per axis, reconciles them into an ordered EffectSpec array
// (art FIRST so segmentation sees the upright frame, transform LAST so it
// reorients the finished composite), and applies them through an injected
// platform `reconcile`. Web rebuilds the pipeline and yields a new track
// (disposing the prior one); native mutates in place and returns the same
// track. The session surfaces the live track via `onTrack`.

import type { EffectSpec } from '../types';
import { presetToEffectSpec } from './shader-to-spec';
import {
  type Axis,
  type KaleidoscopeBindOptions,
  type KaleidoscopeSession,
  type Preset,
  type PresetBook,
  SHADER_AXIS,
} from './types';

/**
 * Platform reconcile. `apply` runs the ordered specs against the base track and
 * returns the output (web: a fresh track, having disposed the previous
 * pipeline; native: the same track, mutated). `dispose` tears down any held
 * pipeline on session teardown.
 */
export type Reconcile = {
  apply: (specs: ReadonlyArray<EffectSpec>) => MediaStreamTrack;
  dispose: () => void;
};

export const createSession = <P extends PresetBook>(
  baseTrack: MediaStreamTrack,
  { presets, onTrack }: KaleidoscopeBindOptions<P>,
  reconcile: Reconcile,
): KaleidoscopeSession<P> => {
  const composite: Record<Axis, EffectSpec | null> = { art: null, transform: null };
  let current = baseTrack;

  const apply = (): void => {
    const specs: EffectSpec[] = [];
    if (composite.art) specs.push(composite.art);
    if (composite.transform) specs.push(composite.transform);
    current = reconcile.apply(specs);
    onTrack?.(current);
  };

  return {
    set(cmd, opts) {
      const preset = presets[cmd] as Preset;
      composite[SHADER_AXIS[preset.shader]] = presetToEffectSpec(
        preset,
        opts as Record<string, unknown> | undefined,
      );
      apply();
    },
    clear(axis) {
      composite[axis] = null;
      apply();
    },
    get track() {
      return current;
    },
    dispose() {
      reconcile.dispose();
    },
  };
};
