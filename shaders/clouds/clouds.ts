// Clouds layer-shader interface: the typed uniforms + a runtime control
// descriptor. The descriptor is the single source the demo generates tuning
// controls from, and it documents every uniform (GLSL can't carry this; TS
// shows up in editors and for LLMs). This is the first of the per-shader type
// files; the shader source is shaders/clouds.frag.

import type { RGB } from '../../src/types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `clouds` layer shader. */
export type CloudsUniforms = {
  /** Sky color near the horizon. */
  readonly uSkyLowColor: RGB;
  /** Sky color overhead. */
  readonly uSkyHighColor: RGB;
  /** Lit (upper) cloud color. */
  readonly uCloudLightColor: RGB;
  /** Shadowed (lower) cloud color. */
  readonly uCloudDarkColor: RGB;
  /** Overall brightness; lower for night, ~1 for day. */
  readonly uExposure: number;
  /** Raymarch step distance; smaller = finer/slower, larger = coarser/faster. */
  readonly uStepSize: number;
  /** How fast the clouds drift. 0 freezes them. */
  readonly uCloudSpeed: number;
  /** Cloud noise frequency; smaller = larger/broader shapes, larger = busier. */
  readonly uCloudScale: number;
  /** Opacity contributed per sample; higher = more solid clouds. */
  readonly uDensity: number;
  /** Noise threshold; lower = more cloud cover, higher = clearer sky. */
  readonly uCoverage: number;
  /** Cloud edge softness; higher = mistier edges. */
  readonly uSoftness: number;
};

/**
 * The `clouds` shader's tunable uniforms. Drives the demo's generated control
 * panel. Defaults here are the "bright day" look; composites override them (the
 * wizard tower runs a sunset palette, the fairy cave a moonlit-night one).
 */
export const CLOUDS_CONTROLS: readonly UniformControl[] = [
  {
    name: 'uSkyLowColor',
    kind: 'color',
    default: [0.48, 0.68, 0.95],
    doc: 'Sky color near the horizon.',
  },
  { name: 'uSkyHighColor', kind: 'color', default: [0.85, 0.93, 1.0], doc: 'Sky color overhead.' },
  {
    name: 'uCloudLightColor',
    kind: 'color',
    default: [1.0, 0.97, 0.9],
    doc: 'Lit (upper) cloud color.',
  },
  {
    name: 'uCloudDarkColor',
    kind: 'color',
    default: [0.62, 0.67, 0.76],
    doc: 'Shadowed (lower) cloud color.',
  },
  {
    name: 'uExposure',
    kind: 'float',
    default: 1.0,
    min: 0.2,
    max: 1.5,
    step: 0.01,
    doc: 'Overall brightness.',
  },
  {
    name: 'uStepSize',
    kind: 'float',
    default: 0.2,
    min: 0.05,
    max: 0.4,
    step: 0.01,
    doc: 'Raymarch step distance; smaller = finer.',
  },
  {
    name: 'uCloudSpeed',
    kind: 'float',
    default: 0.2,
    min: 0.0,
    max: 1.0,
    step: 0.01,
    doc: 'Drift speed; 0 freezes.',
  },
  {
    name: 'uCloudScale',
    kind: 'float',
    default: 0.65,
    min: 0.2,
    max: 2.0,
    step: 0.01,
    doc: 'Cloud frequency; smaller = broader shapes.',
  },
  {
    name: 'uDensity',
    kind: 'float',
    default: 0.07,
    min: 0.01,
    max: 0.3,
    step: 0.005,
    doc: 'Opacity per sample; higher = more solid.',
  },
  {
    name: 'uCoverage',
    kind: 'float',
    default: 0.44,
    min: 0.0,
    max: 0.9,
    step: 0.01,
    doc: 'Threshold; lower = more cloud cover.',
  },
  {
    name: 'uSoftness',
    kind: 'float',
    default: 0.15,
    min: 0.0,
    max: 0.5,
    step: 0.01,
    doc: 'Cloud edge softness.',
  },
];
