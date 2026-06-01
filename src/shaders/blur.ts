// Blur layer-shader interface: a camera-sampling separable gaussian. Unlike the
// generative layer shaders, blur reads its input channel (the camera) and softens
// it rather than generating pixels; its one tunable is `sigma`. The descriptor
// drives the demo's generated slider, exactly like the generative controls.

import type { UniformControl } from './types';

/** Typed uniforms for the `blur` layer shader. */
export type BlurUniforms = {
  /** Gaussian blur sigma (softness). Higher = softer. Clamped [0.5, 7]. */
  readonly sigma: number;
};

/**
 * The `blur` layer's tunable. A single `sigma`; the range matches the clamp the
 * native and web blur passes apply.
 */
export const BLUR_CONTROLS: readonly UniformControl[] = [
  {
    name: 'sigma',
    kind: 'float',
    default: 4,
    min: 0.5,
    max: 7,
    step: 0.1,
    doc: 'Gaussian blur softness; higher = softer.',
  },
];
