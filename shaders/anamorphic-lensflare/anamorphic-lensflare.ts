// Anamorphic lens-flare layer-shader interface: typed uniforms + control
// descriptor. A cinematic camera-lens artifact, a transparent OVERLAY layer
// (use blend 'additive'). All three palette colors are exposed so the flare can
// be color-matched to whatever sits behind it (e.g. the nebula in the space
// composite). Shader source is shaders/anamorphic-lensflare.frag.

import type { RGB } from '../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `anamorphic-lensflare` layer shader. */
export type AnamorphicLensFlareUniforms = {
  /** Flare X position, 0..1 (it drifts slowly around this). */
  readonly uFlareX: number;
  /** Flare Y position, 0..1 (0 = bottom). */
  readonly uFlareY: number;
  /** Overall brightness multiplier. */
  readonly uIntensity: number;
  /** Horizontal streak reach; higher = longer. */
  readonly uStreakLength: number;
  /** Main streak vertical tightness; higher = thinner. */
  readonly uStreakWidth: number;
  /** Optical-ghost strength along the flare axis. */
  readonly uGhostStrength: number;
  /** Core / warm streak tint. */
  readonly uWarmColor: RGB;
  /** Halo / wide-streak tint. */
  readonly uBlueColor: RGB;
  /** Secondary streak / ghost tint. */
  readonly uPinkColor: RGB;
};

/** The `anamorphic-lensflare` shader's tunable uniforms; defaults are the stock cinematic look. */
export const ANAMORPHIC_LENSFLARE_CONTROLS: readonly UniformControl[] = [
  {
    name: 'uFlareX',
    kind: 'float',
    default: 0.68,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Flare X position (drifts around this).',
  },
  {
    name: 'uFlareY',
    kind: 'float',
    default: 0.34,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Flare Y position (0 = bottom).',
  },
  {
    name: 'uIntensity',
    kind: 'float',
    default: 0.85,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Overall brightness.',
  },
  {
    name: 'uStreakLength',
    kind: 'float',
    default: 0.55,
    min: 0,
    max: 1.5,
    step: 0.01,
    doc: 'Horizontal streak reach.',
  },
  {
    name: 'uStreakWidth',
    kind: 'float',
    default: 210,
    min: 20,
    max: 400,
    step: 5,
    doc: 'Main streak tightness; higher = thinner.',
  },
  {
    name: 'uGhostStrength',
    kind: 'float',
    default: 0.55,
    min: 0,
    max: 1.5,
    step: 0.01,
    doc: 'Optical-ghost strength.',
  },
  {
    name: 'uWarmColor',
    kind: 'color',
    default: [1.0, 0.82, 0.58],
    doc: 'Core / warm streak tint.',
  },
  {
    name: 'uBlueColor',
    kind: 'color',
    default: [0.35, 0.55, 1.0],
    doc: 'Halo / wide-streak tint.',
  },
  {
    name: 'uPinkColor',
    kind: 'color',
    default: [1.0, 0.45, 0.95],
    doc: 'Secondary streak / ghost tint.',
  },
];
