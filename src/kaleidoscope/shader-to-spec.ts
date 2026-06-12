// Translate a book composite into the lower-level EffectSpec the primitive
// `applyVideoEffects` consumes. This is the seam between the book vocabulary the
// consumer sees and the effect the pipeline runs; the controls own the active
// composite and reconcile through here.
//
// Every book entry is a composite (an ordered layer stack), so this is a thin
// projection: the layers already carry their own ids, sources, uniforms, and
// blend. Transforms are not book entries; the transform verb handles them.

import type { KaleidoscopeLayer, KaleidoscopePreset } from '../kaleidoscope.preset-book.types';
import type { EffectSpec } from './effect.types';

/** The patch wire shape (layer id + partial uniforms), as the verb receives it. */
type LayerPatchInput = {
  readonly id: string;
  readonly uniforms: Readonly<Record<string, number | readonly number[]>>;
};

/**
 * Project a composite into the spec, optionally merging per-layer uniform
 * patches over the baked values (a switch-with-patches, e.g. restoring a
 * persisted selection). Merging here, at the seam, is what carries the patches
 * to EVERY platform: web rebuilds from these layers, and native re-sends them
 * over setCompositeLayers. A patch addressing a non-tunable or unknown layer id
 * is ignored.
 */
export const compositeToEffectSpec = (
  composite: KaleidoscopePreset,
  patches?: ReadonlyArray<LayerPatchInput>,
): EffectSpec => {
  if (!patches || patches.length === 0) {
    return { name: 'composite', layers: composite.layers };
  }
  const byId = new Map(patches.map((patch) => [patch.id, patch.uniforms]));
  return {
    name: 'composite',
    layers: composite.layers.map((layer) => {
      const override = byId.get(layer.id);
      if (!override || !('uniforms' in layer)) return layer;
      return { ...layer, uniforms: { ...layer.uniforms, ...override } } as KaleidoscopeLayer;
    }),
  };
};
