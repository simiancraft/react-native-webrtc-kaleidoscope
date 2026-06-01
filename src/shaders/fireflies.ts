// Fireflies layer-shader interface: typed uniforms + control descriptor. A
// transparent overlay of drifting glowing motes (use blend 'additive'). Shader
// source is shaders/fireflies.frag.

import type { UniformControl } from './types';

/** Typed uniforms for the `fireflies` layer shader. */
export type FirefliesUniforms = {
  /** Radius of each firefly's soft glow. */
  readonly uGlowSize: number;
  /** Size of the bright center dot. */
  readonly uDotSize: number;
  /** Drift movement speed. */
  readonly uSpeed: number;
  /** Twinkle (fade in/out) speed. */
  readonly uTwinkle: number;
};

/** The `fireflies` shader's tunable uniforms; defaults are the denser look. */
export const FIREFLIES_CONTROLS: readonly UniformControl[] = [
  {
    name: 'uGlowSize',
    kind: 'float',
    default: 0.035,
    min: 0.005,
    max: 0.1,
    step: 0.001,
    doc: 'Glow radius.',
  },
  {
    name: 'uDotSize',
    kind: 'float',
    default: 0.006,
    min: 0.001,
    max: 0.02,
    step: 0.001,
    doc: 'Bright center size.',
  },
  {
    name: 'uSpeed',
    kind: 'float',
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Movement speed.',
  },
  {
    name: 'uTwinkle',
    kind: 'float',
    default: 2.5,
    min: 0,
    max: 5,
    step: 0.1,
    doc: 'Fade in/out speed.',
  },
];
