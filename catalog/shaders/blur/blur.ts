// Blur layer-shader interface: a camera-sampling separable gaussian. Unlike the
// generative layer shaders, blur reads its input channel (the camera) and softens
// it rather than generating pixels; its one tunable is `sigma`. The descriptor
// drives the demo's generated slider, exactly like the generative controls.

import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `blur` layer shader. */
export type BlurUniforms = {
  /** Gaussian blur sigma (softness). Higher = softer. Slider range [0.5, 10]. */
  readonly sigma: number;
};

/**
 * The `blur` layer's tunable. A single `sigma`, surfaced as "blur" (the `label`).
 * The live kernel is a 13-tap separable gaussian whose tap spacing also scales
 * with sigma, so the top of the slider keeps softening (with a faint ghost) past
 * where a fixed-radius kernel saturates. The max of 10 keeps that spread subtle;
 * see the kernel in web-driver/effects/composite.ts (mirrored on Android + iOS).
 */
export const BLUR_CONTROLS: readonly UniformControl[] = [
  {
    name: 'sigma',
    label: 'blur',
    kind: 'float',
    default: 4,
    min: 0.5,
    max: 10,
    step: 0.1,
    doc: 'Gaussian blur softness; higher = softer.',
  },
];
