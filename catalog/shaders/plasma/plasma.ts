// Plasma layer-shader interface: typed uniforms + control descriptor. A two-
// color time-morphing field, an opaque BACKGROUND layer (the cheapest
// procedural engine worth shipping). The same shader also backs the standalone
// `plasma` book presets (ocean/sunset/mint/fast) via ShaderOptionsMap; this file
// is the layer-side type + control surface. Shader source is shaders/plasma.frag.

// Cost: CHEAP -- ~0.35 ms/draw, ~1x plasma (shader:view meter
// @1920, Intel UHD 770, default uniforms, 2026-06-14). The cost floor: a bare sum of sines.
// Rubric + full ranking: ../README.md ("Cost").
import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `plasma` layer shader. */
export type PlasmaUniforms = {
  /** First palette color, RGB each channel 0..1. */
  readonly uColorA: RGB;
  /** Second palette color, RGB each channel 0..1. */
  readonly uColorB: RGB;
  /** Animation rate; 0 freezes the field. */
  readonly uSpeed: number;
  /** Spatial frequency; higher = more, tighter cells. */
  readonly uScale: number;
};

/** The `plasma` shader's tunable uniforms; defaults are the cool "ocean" look. */
export const PLASMA_CONTROLS: readonly UniformControl[] = [
  { name: 'uColorA', kind: 'color', default: [0.0, 0.3, 0.6], doc: 'First palette color.' },
  { name: 'uColorB', kind: 'color', default: [0.0, 0.6, 0.6], doc: 'Second palette color.' },
  {
    name: 'uSpeed',
    kind: 'float',
    default: 0.3,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Animation rate; 0 freezes.',
  },
  {
    name: 'uScale',
    kind: 'float',
    default: 8,
    min: 1,
    max: 20,
    step: 0.5,
    doc: 'Spatial frequency; higher = tighter cells.',
  },
];
