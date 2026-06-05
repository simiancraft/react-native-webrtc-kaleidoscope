// Nebula layer-shader interface: typed uniforms + control descriptor. A deep-
// space starfield BACKGROUND layer (opaque), uniform-ized from the fixed
// Deadlights V2 backdrop so a composite can color-grade and pace it (the nebula
// composite runs it full-frame behind the masked subject). Shader source is
// ./nebula.frag.

import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `nebula` layer shader. */
export type NebulaUniforms = {
  /** Overall tint / color grade; [1,1,1] keeps the stock star colors. */
  readonly uColor: RGB;
  /** Final glow multiplier; 1 = stock, higher = brighter field. */
  readonly uBrightness: number;
  /** Drift + rotation rate; 1 = stock, 0 freezes the field. */
  readonly uSpeed: number;
  /** Star color-cycle (twinkle) rate; 1 = stock. */
  readonly uTwinkleSpeed: number;
  /** Starfield zoom / density; >1 = more, smaller stars. */
  readonly uScale: number;
  /** Star-core size; 1 = stock, higher = fatter cores. */
  readonly uStarGlow: number;
};

/** The `nebula` shader's tunable uniforms; defaults reproduce the stock look. */
export const NEBULA_CONTROLS: readonly UniformControl[] = [
  { name: 'uColor', kind: 'color', default: [1, 1, 1], doc: 'Overall tint / color grade.' },
  {
    name: 'uBrightness',
    kind: 'float',
    default: 1,
    min: 0,
    max: 3,
    step: 0.01,
    doc: 'Final glow multiplier.',
  },
  {
    name: 'uSpeed',
    kind: 'float',
    default: 1,
    min: 0,
    max: 3,
    step: 0.01,
    doc: 'Drift + rotation rate; 0 freezes.',
  },
  {
    name: 'uTwinkleSpeed',
    kind: 'float',
    default: 1,
    min: 0,
    max: 3,
    step: 0.01,
    doc: 'Star twinkle rate.',
  },
  {
    name: 'uScale',
    kind: 'float',
    default: 1,
    min: 0.3,
    max: 3,
    step: 0.01,
    doc: 'Zoom / density; >1 = more, smaller stars.',
  },
  {
    name: 'uStarGlow',
    kind: 'float',
    default: 1,
    min: 0.2,
    max: 3,
    step: 0.01,
    doc: 'Star-core size.',
  },
];
