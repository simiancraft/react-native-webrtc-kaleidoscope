// God rays layer-shader interface: typed uniforms + control descriptor. An
// additive overlay (premultiplied), reusable on any target. Shader source is
// ./godrays.frag.

// Cost: CHEAP -- ~0.68 ms/draw, ~2.4x plasma (shader:view meter
// @1920, Intel UHD 770, default uniforms, 2026-06-14).
// Rubric + full ranking: ../README.md ("Cost").
import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `godrays` layer shader. */
export type GodraysUniforms = {
  /** Ray tint (linear-ish RGB). */
  readonly uLightColor: RGB;
  /** Number of ray bands. */
  readonly uRayCount: number;
  /** Drift speed. */
  readonly uRaySpeed: number;
  /** Overall brightness / additive strength. */
  readonly uRayIntensity: number;
  /** Edge falloff exponent; higher = crisper shafts. */
  readonly uRaySoftness: number;
  /** Extra glow concentrated near the top. */
  readonly uTopGlow: number;
  /** Vertical falloff from the top. */
  readonly uFadeDistance: number;
  /** Horizontal wobble magnitude. */
  readonly uWobbleAmount: number;
  /** Wobble animation speed. */
  readonly uWobbleSpeed: number;
};

/** The `godrays` shader's tunable uniforms; defaults are the neutral cool-white look. */
export const GODRAYS_CONTROLS: readonly UniformControl[] = [
  { name: 'uLightColor', kind: 'color', default: [0.85, 0.95, 1.0], doc: 'Ray tint.' },
  {
    name: 'uRayCount',
    kind: 'float',
    default: 16,
    min: 2,
    max: 40,
    step: 1,
    doc: 'Number of ray bands.',
  },
  {
    name: 'uRaySpeed',
    kind: 'float',
    default: 0.95,
    min: 0,
    max: 3,
    step: 0.05,
    doc: 'Drift speed.',
  },
  {
    name: 'uRayIntensity',
    kind: 'float',
    default: 0.85,
    min: 0,
    max: 3,
    step: 0.05,
    doc: 'Brightness / additive strength.',
  },
  {
    name: 'uRaySoftness',
    kind: 'float',
    default: 2.4,
    min: 0.5,
    max: 6,
    step: 0.1,
    doc: 'Edge falloff; higher = crisper.',
  },
  {
    name: 'uTopGlow',
    kind: 'float',
    default: 0.65,
    min: 0,
    max: 1.5,
    step: 0.05,
    doc: 'Extra glow near the top.',
  },
  {
    name: 'uFadeDistance',
    kind: 'float',
    default: 1.25,
    min: 0.2,
    max: 3,
    step: 0.05,
    doc: 'Vertical falloff from the top.',
  },
  {
    name: 'uWobbleAmount',
    kind: 'float',
    default: 0.08,
    min: 0,
    max: 0.3,
    step: 0.01,
    doc: 'Horizontal wobble.',
  },
  {
    name: 'uWobbleSpeed',
    kind: 'float',
    default: 0.55,
    min: 0,
    max: 2,
    step: 0.05,
    doc: 'Wobble speed.',
  },
];
