import type { EffectInput, EffectSpec } from './effect.types';

/** Normalize an `EffectInput` (bare name or spec) into an `EffectSpec`. */
export const toEffectSpec = (input: EffectInput): EffectSpec =>
  typeof input === 'string' ? ({ name: input } as EffectSpec) : input;
