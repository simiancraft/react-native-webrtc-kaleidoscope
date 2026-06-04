// Simianlights layer-shader interface: typed uniforms + control descriptor. The
// calmer sibling of the nebula (fewer starfield layers, larger near-field
// scale), same opaque BACKGROUND-layer role and same uniform surface. Shader
// source is shaders/simianlights.frag.

import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `simianlights` layer shader. */
export type SimianlightsUniforms = {
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

/** The `simianlights` shader's tunable uniforms; defaults reproduce the stock look. */
export const SIMIANLIGHTS_CONTROLS: readonly UniformControl[] = [
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
