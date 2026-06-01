// Translate a resolved art preset (shader + options, with optional per-call
// overrides) into the lower-level EffectSpec the primitive `applyVideoEffects`
// consumes. This is the seam between the unified shader model the consumer sees
// and the effect the pipeline runs; the controls own the composite and
// reconcile through here.
//
// blur and background-image are special engines with their own specs.
// Everything else is a generative background shader: its options become
// u-prefixed uniforms by convention (`colorA` -> `uColorA`) and it flows
// through the one generic ShaderSpec. So a new generative shader needs no case
// here — only its `.frag` (which codegens into the shader registry) and its
// option contract. Transforms are not book shaders; the transform verb handles
// them.

import type { EffectSpec } from '../types';
import type { BookEntry, ShaderOptionsMap } from './types';

// option key -> shader uniform name, e.g. `colorA` -> `uColorA`, `speed` -> `uSpeed`.
const toUniformName = (key: string): string => `u${key.charAt(0).toUpperCase()}${key.slice(1)}`;

export const presetToEffectSpec = (
  preset: BookEntry,
  opts?: Record<string, unknown>,
  id?: string,
): EffectSpec => {
  // A scene passes its layer stack straight through to the compositor; the
  // layers already carry their own sources/uniforms/blend. No options merge.
  if (preset.shader === 'scene') {
    return { name: 'scene', layers: preset.layers };
  }
  if (preset.shader === 'blur') {
    const o = { ...preset.options, ...opts } as ShaderOptionsMap['blur'];
    return o.sigma == null ? { name: 'blur' } : { name: 'blur', sigma: o.sigma };
  }
  if (preset.shader === 'background-image') {
    const o = { ...preset.options, ...opts } as ShaderOptionsMap['background-image'];
    // `id` (the book key) is the native identity; `source` renders on web.
    return { name: 'background-image', source: o.source, ...(id != null ? { id } : {}) };
  }
  // Generative shader: map options to uniforms by convention and run through
  // the generic processor (registry-keyed by `shader`).
  const merged = { ...preset.options, ...opts } as Record<string, number | readonly number[]>;
  const uniforms: Record<string, number | readonly number[]> = {};
  for (const [key, value] of Object.entries(merged)) {
    uniforms[toUniformName(key)] = value;
  }
  return { name: 'shader', shader: preset.shader, uniforms };
};
