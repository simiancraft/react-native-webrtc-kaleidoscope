// Shared shape for a layer shader's tunable uniforms. Each shader exports a
// `*_CONTROLS` list of these; the demo generates a control per entry, and the
// list doubles as documentation (name, default, range, and a doc string).

import type { RGB } from '../../../src/lib/primitives.types';

/**
 * A single tunable uniform with enough metadata to render a control and seed a
 * default. `color` is an RGB triple (0..1 per channel); `float` is a scalar with
 * a range. Reusable across shaders.
 */
// `name` is the uniform key (it maps to the shader uniform and the layer's
// `uniforms` record). `label` is the optional display string for the generated
// control; when present the UI shows it instead of `name`, so a control can read
// "blur" while still writing the `sigma` uniform. Defaults to `name`.
// Every variant carries the shared META (name, label?, kind, default, doc); the
// remaining fields are the PROPS that spread into the kind's control component
// (min/max/step for float, points for polygon). `kind` narrows which props apply.
export type UniformControl =
  | {
      readonly name: string;
      readonly label?: string;
      readonly kind: 'color';
      readonly default: RGB;
      readonly doc: string;
    }
  | {
      readonly name: string;
      readonly label?: string;
      readonly kind: 'float';
      readonly default: number;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly doc: string;
    }
  | {
      readonly name: string;
      readonly label?: string;
      readonly kind: 'switch';
      readonly default: number; // 0 (off) | 1 (on)
      readonly doc: string;
    }
  | {
      // The uniform is a vec2 array `vec2 uX[points]`; `default` is the flat
      // [x0,y0, x1,y1, ...] of length 2*points. The prototype editor renders
      // x/y sliders per point on one row; a drag editor replaces it later.
      readonly name: string;
      readonly label?: string;
      readonly kind: 'polygon';
      readonly default: readonly number[];
      readonly points: number;
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
