// Outrun-grid layer-shader interface: typed uniforms + control descriptor.
// A scrolling neon perspective grid with a banded retrowave sun, an opaque
// BACKGROUND layer (issue #70). One outrun-grid.frag fans out into the book
// presets (classic, miami, tron, acid, vapor) by varying these uniforms; the
// three color pairs (grid, sun, sky) are the big levers. Shader source is
// shaders/outrun-grid/outrun-grid.frag.

import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `outrun-grid` layer shader. */
export type OutrunGridUniforms = {
  /** Sky gradient color at the top of frame. */
  readonly uSkyTop: RGB;
  /** Sky gradient color at the horizon. */
  readonly uSkyHorizon: RGB;
  /** Sun gradient color at its top. */
  readonly uSunTop: RGB;
  /** Sun gradient color at its bottom. */
  readonly uSunBottom: RGB;
  /** Neon grid line tint (also the horizon seam). */
  readonly uGridColor: RGB;
  /** Grid cells across the floor; higher is finer. */
  readonly uGridDensity: number;
  /** Line glow width/softness, 0..1. */
  readonly uGridGlow: number;
  /** Grid scroll rate toward the viewer; 0 freezes. */
  readonly uSpeed: number;
  /** Sun radius in vUv.y units. */
  readonly uSunSize: number;
  /** Horizontal slit count cut into the sun's lower half. */
  readonly uSunBands: number;
  /** Horizon height in vUv.y, 0..1 (floor below, sky above). */
  readonly uHorizon: number;
  /** Eases the additive glow at frame center (the face zone); 0 = off. */
  readonly uCalm: number;
};

/** The `outrun-grid` shader's tunables; defaults are the "classic" synthwave look. */
export const OUTRUN_GRID_CONTROLS: readonly UniformControl[] = [
  {
    name: 'uSkyTop',
    kind: 'color',
    default: [0.05, 0.02, 0.18],
    doc: 'Sky color at top of frame.',
  },
  {
    name: 'uSkyHorizon',
    kind: 'color',
    default: [0.35, 0.05, 0.4],
    doc: 'Sky color at the horizon.',
  },
  { name: 'uSunTop', kind: 'color', default: [1.0, 0.85, 0.3], doc: 'Sun color at its top.' },
  {
    name: 'uSunBottom',
    kind: 'color',
    default: [0.95, 0.15, 0.5],
    doc: 'Sun color at its bottom.',
  },
  { name: 'uGridColor', kind: 'color', default: [0.95, 0.2, 0.7], doc: 'Neon grid line tint.' },
  {
    name: 'uGridDensity',
    kind: 'float',
    default: 3,
    min: 1,
    max: 32,
    step: 1,
    doc: 'Grid cells across the floor.',
  },
  {
    name: 'uGridGlow',
    kind: 'float',
    default: 0.5,
    min: 0.05,
    max: 1,
    step: 0.01,
    doc: 'Line glow width/softness.',
  },
  {
    name: 'uSpeed',
    kind: 'float',
    default: 0.3,
    min: 0,
    max: 3,
    step: 0.01,
    doc: 'Scroll rate toward the viewer; 0 freezes.',
  },
  {
    name: 'uSunSize',
    kind: 'float',
    default: 0.32,
    min: 0.1,
    max: 0.6,
    step: 0.01,
    doc: 'Sun radius.',
  },
  {
    name: 'uSunBands',
    kind: 'float',
    default: 7,
    min: 0,
    max: 16,
    step: 1,
    doc: 'Horizontal slit count in the sun.',
  },
  {
    name: 'uHorizon',
    kind: 'float',
    default: 0.55,
    min: 0.2,
    max: 0.8,
    step: 0.01,
    doc: 'Horizon height (floor below, sky above).',
  },
  {
    name: 'uCalm',
    kind: 'float',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Eases the additive glow at frame center (face zone).',
  },
];
