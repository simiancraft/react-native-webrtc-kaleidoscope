// Translate a resolved preset (shader + options, with optional per-call
// overrides) into the lower-level EffectSpec the primitive `applyVideoEffects`
// consumes. This is the seam between the unified shader model the consumer sees
// and the effect array the pipeline runs; kaleidoscope() owns the composite and
// reconciles through here.
//
// Switching on `preset.shader` narrows `preset.options` to the matching member
// (Preset is a discriminated union), so the only cast is folding the loosely
// typed override in; the public `set` signature keeps overrides type-safe.

import type { EffectSpec } from '../types';
import type { Preset, ShaderOptionsMap } from './types';

export const presetToEffectSpec = (preset: Preset, opts?: Record<string, unknown>): EffectSpec => {
  switch (preset.shader) {
    case 'blur': {
      const o = { ...preset.options, ...opts } as ShaderOptionsMap['blur'];
      return o.sigma == null ? { name: 'blur' } : { name: 'blur', sigma: o.sigma };
    }
    case 'background-image': {
      const o = { ...preset.options, ...opts } as ShaderOptionsMap['background-image'];
      return { name: 'background-image', source: o.source };
    }
    case 'plasma': {
      const o = { ...preset.options, ...opts } as ShaderOptionsMap['plasma'];
      return { name: 'plasma', ...o };
    }
    case 'transform': {
      const o = { ...preset.options, ...opts } as ShaderOptionsMap['transform'];
      return { name: o.op };
    }
    default: {
      const never: never = preset;
      throw new Error(`kaleidoscope: unknown shader ${String((never as Preset).shader)}`);
    }
  }
};
