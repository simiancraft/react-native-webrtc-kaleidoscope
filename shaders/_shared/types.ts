// Shared shape for a layer shader's tunable uniforms. Each shader exports a
// `*_CONTROLS` list of these; the demo generates a control per entry, and the
// list doubles as documentation (name, default, range, and a doc string).

import type { RGB } from '../../src/types';

/**
 * A single tunable uniform with enough metadata to render a control and seed a
 * default. `color` is an RGB triple (0..1 per channel); `float` is a scalar with
 * a range. Reusable across shaders.
 */
export type UniformControl =
  | { readonly name: string; readonly kind: 'color'; readonly default: RGB; readonly doc: string }
  | {
      readonly name: string;
      readonly kind: 'float';
      readonly default: number;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly doc: string;
    };

/** The default uniform values from a control list, as a flat uniform map. */
export const defaultUniforms = (
  controls: readonly UniformControl[],
): Record<string, number | readonly number[]> => {
  const out: Record<string, number | readonly number[]> = {};
  for (const c of controls) out[c.name] = c.default;
  return out;
};
