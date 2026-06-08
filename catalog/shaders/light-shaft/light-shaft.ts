// Light-shaft layer-shader interface: typed uniforms + control descriptor. ONE
// volumetric beam with dust motes, on a transparent background (use blend
// 'additive'). The lightweight interior-scene sibling of light-beams-and-motes:
// the beam geometry is tunable (top/bottom center + width), so a preset aims the
// shaft at an image's real light and matches its color with the picker; the
// motes take the shaft color. Shader source is ./light-shaft.frag. Defaults are
// a generic warm shaft entering from the upper-left.

import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `light-shaft` layer shader. */
export type LightShaftUniforms = {
  /** The light's color; the motes take this too. */
  readonly uShaftColor: RGB;
  /** Horizontal center where the shaft enters at the top, 0..1. */
  readonly uShaftTopX: number;
  /** Shaft width at the top (the source). */
  readonly uShaftTopWidth: number;
  /** Horizontal center where the shaft lands at the bottom, 0..1; lean = bottom - top. */
  readonly uShaftBottomX: number;
  /** Shaft width at the bottom (the fan). */
  readonly uShaftBottomWidth: number;
  /** Animation rate; 1 = stock, 0 freezes the field. */
  readonly uSpeed: number;
  /** Beam fill strength (absolute). */
  readonly uBeamAlpha: number;
  /** Mote brightness (absolute). */
  readonly uMoteAlpha: number;
  /** Mote glow radius, in mote-size multiples. */
  readonly uGlowSize: number;
  /** Beam polygon edge softness. */
  readonly uBeamSoftness: number;
  /** Overall overlay opacity, applied to the final alpha. */
  readonly uOverlayAlpha: number;
  /** Active motes (<= MOTE_COUNT, 48); fewer = cheaper. */
  readonly uMoteCount: number;
};

/** The `light-shaft` shader's tunable uniforms; defaults are a warm upper-left shaft. */
export const LIGHT_SHAFT_CONTROLS: readonly UniformControl[] = [
  {
    name: 'uShaftColor',
    kind: 'color',
    default: [1.0, 0.92, 0.78],
    doc: 'Light color (motes match it).',
  },
  {
    name: 'uShaftTopX',
    kind: 'float',
    default: 0.18,
    min: -0.2,
    max: 1.2,
    step: 0.01,
    doc: 'Top center (where the light enters).',
  },
  {
    name: 'uShaftTopWidth',
    kind: 'float',
    default: 0.18,
    min: 0.02,
    max: 1.5,
    step: 0.01,
    doc: 'Shaft width at the top.',
  },
  {
    name: 'uShaftBottomX',
    kind: 'float',
    default: 0.42,
    min: -0.2,
    max: 1.2,
    step: 0.01,
    doc: 'Bottom center (where it lands); lean = bottom - top.',
  },
  {
    name: 'uShaftBottomWidth',
    kind: 'float',
    default: 0.55,
    min: 0.02,
    max: 1.5,
    step: 0.01,
    doc: 'Shaft width at the bottom (the fan).',
  },
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
  {
    name: 'uMoteCount',
    kind: 'float',
    default: 48,
    min: 0,
    max: 48,
    step: 1,
    doc: 'Active motes (fewer = cheaper).',
  },
];
