// Data-mesh layer-shader interface: typed uniforms + control descriptor. A mid-
// 2000s corporate wireframe-wave background, an opaque BACKGROUND layer. One
// data-mesh.frag fans out into the book presets (datafield, boardroom, acid,
// cobalt, and slate) by varying these uniforms; the color set is the
// big lever (gradient + line/crest/haze/accent), the structural dials set
// composition and motion. Shader source is shaders/data-mesh/data-mesh.frag.

import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `data-mesh` layer shader. */
export type DataMeshUniforms = {
  /** Background gradient color at the top of frame. */
  readonly uBgTop: RGB;
  /** Background gradient color at the bottom of frame. */
  readonly uBgBottom: RGB;
  /** Mid wireframe-line tint (the trough/body color). */
  readonly uLineColor: RGB;
  /** Crest highlight color (brightest along the peaks). */
  readonly uCrestColor: RGB;
  /** Atmospheric haze tint on the far rows. */
  readonly uHazeColor: RGB;
  /** The one restrained accent color (e.g. enterprise red). */
  readonly uAccentColor: RGB;
  /** Wave-field spatial frequency; lower = looser, broader hills. */
  readonly uWaveScale: number;
  /** Vertical wave displacement amount (near rows). */
  readonly uWaveAmp: number;
  /** Animation rate; 0 freezes the surface. */
  readonly uWaveSpeed: number;
  /** Column-grid density across the surface; keep loose. */
  readonly uGridX: number;
  /** Horizon height in uv.y units (rows converge toward it). */
  readonly uHorizon: number;
  /** Perspective scale of the farthest row; > 0 (guards the divide). */
  readonly uFarScale: number;
  /** Diagonal tilt; raises the right side for corner composition. */
  readonly uSlant: number;
  /** Wireframe line half-width (smaller = finer, sharper). */
  readonly uLineWidth: number;
  /** Emphasis of glowing intersection nodes (the dot reading), 0..1. */
  readonly uNodeMix: number;
  /** Emphasis of vertical struts (the wireframe reading), 0..1. */
  readonly uStrutMix: number;
  /** Overall additive mesh-glow / bloom strength. */
  readonly uGlow: number;
  /** Atmospheric far-haze strength. */
  readonly uHaze: number;
  /** Floating-particle intensity; 0 disables the field. */
  readonly uParticles: number;
  /** Lone accent-mote intensity; 0 disables it. */
  readonly uAccent: number;
  /** Eases the additive glow at frame center (the face zone); 0 = off. */
  readonly uCalm: number;
};

/** The `data-mesh` shader's tunables; defaults are the cyan "datafield" look. */
export const DATA_MESH_CONTROLS: readonly UniformControl[] = [
  {
    name: 'uBgTop',
    kind: 'color',
    default: [0.01, 0.02, 0.05],
    doc: 'Background color at top of frame.',
  },
  {
    name: 'uBgBottom',
    kind: 'color',
    default: [0.02, 0.05, 0.12],
    doc: 'Background color at bottom of frame.',
  },
  {
    name: 'uLineColor',
    kind: 'color',
    default: [0.1, 0.55, 0.75],
    doc: 'Mid wireframe-line tint.',
  },
  { name: 'uCrestColor', kind: 'color', default: [0.85, 0.97, 1.0], doc: 'Crest highlight color.' },
  {
    name: 'uHazeColor',
    kind: 'color',
    default: [0.05, 0.25, 0.4],
    doc: 'Far-row atmospheric haze tint.',
  },
  {
    name: 'uAccentColor',
    kind: 'color',
    default: [0.9, 0.15, 0.12],
    doc: 'The one restrained accent color.',
  },
  {
    name: 'uWaveScale',
    kind: 'float',
    default: 1.2,
    min: 0.4,
    max: 4,
    step: 0.05,
    doc: 'Wave frequency; lower = looser, broader hills.',
  },
  {
    name: 'uWaveAmp',
    kind: 'float',
    default: 0.14,
    min: 0,
    max: 0.4,
    step: 0.005,
    doc: 'Vertical wave displacement (near rows).',
  },
  {
    name: 'uWaveSpeed',
    kind: 'float',
    default: 0.25,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Animation rate; 0 freezes.',
  },
  {
    name: 'uGridX',
    kind: 'float',
    default: 7,
    min: 1,
    max: 24,
    step: 0.5,
    doc: 'Column-grid density; keep loose.',
  },
  {
    name: 'uHorizon',
    kind: 'float',
    default: 0.16,
    min: -0.2,
    max: 0.45,
    step: 0.01,
    doc: 'Horizon height (rows converge toward it).',
  },
  {
    name: 'uFarScale',
    kind: 'float',
    default: 0.12,
    min: 0.05,
    max: 0.5,
    step: 0.01,
    doc: 'Perspective scale of the farthest row.',
  },
  {
    name: 'uSlant',
    kind: 'float',
    default: 0.18,
    min: -0.6,
    max: 0.6,
    step: 0.01,
    doc: 'Diagonal tilt for corner composition.',
  },
  {
    name: 'uLineWidth',
    kind: 'float',
    default: 0.018,
    min: 0.004,
    max: 0.06,
    step: 0.001,
    doc: 'Wireframe line half-width; smaller = finer.',
  },
  {
    name: 'uNodeMix',
    kind: 'float',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Glowing-node (dot) emphasis.',
  },
  {
    name: 'uStrutMix',
    kind: 'float',
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Vertical-strut (wireframe) emphasis.',
  },
  {
    name: 'uGlow',
    kind: 'float',
    default: 1,
    min: 0,
    max: 3,
    step: 0.01,
    doc: 'Overall mesh-glow / bloom strength.',
  },
  {
    name: 'uHaze',
    kind: 'float',
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Atmospheric far-haze strength.',
  },
  {
    name: 'uParticles',
    kind: 'float',
    default: 0.5,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Floating-particle intensity; 0 disables.',
  },
  {
    name: 'uAccent',
    kind: 'float',
    default: 0,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Lone accent-mote intensity; 0 disables.',
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
