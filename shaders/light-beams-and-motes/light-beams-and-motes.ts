// Light-beams-and-motes layer-shader interface: typed uniforms + control
// descriptor. A transparent overlay of dust motes drifting inside three
// independently colored polygon light beams (use blend 'additive'). Shader
// source is shaders/light-beams-and-motes.frag. Beam geometry and per-beam colors
// are fixed in the shader; the tunables below grade and pace the whole field.
// Defaults reproduce the stock prototype look.

import type { RGB } from '../../src/types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `light-beams-and-motes` layer shader. */
export type LightBeamsAndMotesUniforms = {
  /** Overall tint / color grade; [1,1,1] keeps the stock beam colors. */
  readonly uColor: RGB;
  /** Animation rate; 1 = stock, 0 freezes the field. */
  readonly uSpeed: number;
  /** Beam fill strength (absolute); stock 0.18. */
  readonly uBeamAlpha: number;
  /** Mote brightness (absolute); stock 0.48. */
  readonly uMoteAlpha: number;
  /** Mote glow radius, in mote-size multiples. */
  readonly uGlowSize: number;
  /** Beam polygon edge softness. */
  readonly uBeamSoftness: number;
  /** Overall overlay opacity, applied to the final alpha. */
  readonly uOverlayAlpha: number;
};

/** The `light-beams-and-motes` shader's tunable uniforms; defaults reproduce the stock look. */
export const LIGHT_BEAMS_AND_MOTES_CONTROLS: readonly UniformControl[] = [
  { name: 'uColor', kind: 'color', default: [1, 1, 1], doc: 'Overall tint / color grade.' },
  {
    name: 'uSpeed',
    kind: 'float',
    default: 1,
    min: 0,
    max: 3,
    step: 0.01,
    doc: 'Animation rate; 0 freezes.',
  },
  {
    name: 'uBeamAlpha',
    kind: 'float',
    default: 0.18,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Beam fill strength.',
  },
  {
    name: 'uMoteAlpha',
    kind: 'float',
    default: 0.48,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Mote brightness.',
  },
  {
    name: 'uGlowSize',
    kind: 'float',
    default: 3.2,
    min: 1,
    max: 6,
    step: 0.1,
    doc: 'Mote glow radius (size multiples).',
  },
  {
    name: 'uBeamSoftness',
    kind: 'float',
    default: 0.055,
    min: 0.005,
    max: 0.2,
    step: 0.005,
    doc: 'Beam edge softness.',
  },
  {
    name: 'uOverlayAlpha',
    kind: 'float',
    default: 0.72,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Overall overlay opacity.',
  },
];
