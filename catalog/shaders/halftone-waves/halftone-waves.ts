// Halftone-waves layer-shader interface: typed uniforms + control descriptor.
// A dot lattice with traveling-wave size modulation (the late-2000s
// "mathematical" tech texture), an opaque BACKGROUND layer (issue #61). One
// halftone-waves.frag fans out into the book presets (boardroom, press,
// ripple) by varying these uniforms; the two-tone palette is the big lever.
// Shader source is shaders/halftone-waves.frag.

// Cost: CHEAP -- ~0.45 ms/draw, ~1.6x plasma (shader:view meter
// @1920, Intel UHD 770, default uniforms, 2026-06-14).
// Rubric + full ranking: ../README.md ("Cost").
import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `halftone-waves` layer shader. */
export type HalftoneWavesUniforms = {
  /** Field color behind the dots. */
  readonly uPaper: RGB;
  /** Dot color. */
  readonly uInk: RGB;
  /** Dot-grid cells across frame height; higher = finer texture. */
  readonly uPitch: number;
  /** Base dot radius in cell units. */
  readonly uDotSize: number;
  /** Wave modulation depth; 0 = static even dots. */
  readonly uWaveAmp: number;
  /** Wave travel rate; 0 freezes. */
  readonly uSpeed: number;
  /** Dot shape: 0 diamond, 1 circle, 2 square. */
  readonly uShape: number;
  /** Wave direction in radians. */
  readonly uAngle: number;
  /** Eases the waves at frame center (the face zone); 0 = off. */
  readonly uCalm: number;
};

/** The `halftone-waves` shader's tunables; defaults are the "boardroom" look. */
export const HALFTONE_WAVES_CONTROLS: readonly UniformControl[] = [
  { name: 'uPaper', kind: 'color', default: [0.95, 0.95, 0.94], doc: 'Field color.' },
  { name: 'uInk', kind: 'color', default: [0.62, 0.66, 0.7], doc: 'Dot color.' },
  {
    name: 'uPitch',
    kind: 'float',
    default: 26,
    min: 8,
    max: 60,
    step: 1,
    doc: 'Dot-grid cells across frame height.',
  },
  {
    name: 'uDotSize',
    kind: 'float',
    default: 0.26,
    min: 0.05,
    max: 0.5,
    step: 0.01,
    doc: 'Base dot radius in cell units.',
  },
  {
    name: 'uWaveAmp',
    kind: 'float',
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Wave modulation depth.',
  },
  {
    name: 'uSpeed',
    kind: 'float',
    default: 0.5,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Wave travel rate; 0 freezes.',
  },
  {
    name: 'uShape',
    kind: 'float',
    default: 1,
    min: 0,
    max: 2,
    step: 0.05,
    doc: 'Dot shape: 0 diamond, 1 circle, 2 square.',
  },
  {
    name: 'uAngle',
    kind: 'float',
    default: 0.6,
    min: 0,
    max: 6.28,
    step: 0.01,
    doc: 'Wave direction, radians.',
  },
  {
    name: 'uCalm',
    kind: 'float',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Eases the waves at frame center (face zone).',
  },
];
