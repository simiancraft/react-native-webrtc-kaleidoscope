// Translate a book composite into the lower-level EffectSpec the primitive
// `applyVideoEffects` consumes. This is the seam between the book vocabulary the
// consumer sees and the effect the pipeline runs; the controls own the active
// composite and reconcile through here.
//
// Every book entry is a composite (an ordered layer stack), so this is a thin
// projection: the layers already carry their own ids, sources, uniforms, and
// blend. Transforms are not book entries; the transform verb handles them.

import type { KaleidoscopePreset } from '../kaleidoscope.preset-book.types';
import type { EffectSpec } from '../types';

export const compositeToEffectSpec = (composite: KaleidoscopePreset): EffectSpec => ({
  name: 'composite',
  layers: composite.layers,
});
