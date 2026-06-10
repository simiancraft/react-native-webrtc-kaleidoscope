// Light-beams-and-motes layer-shader interface: typed uniforms + control
// descriptor. A transparent overlay of dust motes drifting inside three
// independently positioned, colored, and lit polygon light beams (use blend
// 'additive'). Shader source is ./light-beams-and-motes.frag. Each beam owns a
// 4-point quad (row-major TL, TR, BL, BR; y-up), a color, a fill strength, and an
// on/off flag; the motes are shared. Defaults reproduce the stock prototype look.

import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `light-beams-and-motes` layer shader. */
export type LightBeamsAndMotesUniforms = {
  /** Animation rate; 1 = stock, 0 freezes the field. */
  readonly uSpeed: number;
  /** Beam polygon edge softness (shared by all beams). */
  readonly uBeamSoftness: number;
  /** Overall overlay opacity, applied to the final alpha. */
  readonly uOverlayAlpha: number;
  /** Beam 1 quad corners row-major (TL, TR, BL, BR), flat [x0,y0, ...]. */
  readonly uBeam1Poly: readonly number[];
  /** Beam 1 color. */
  readonly uBeam1Color: RGB;
  /** Beam 1 fill strength (absolute). */
  readonly uBeam1Alpha: number;
  /** Beam 1 on/off; 0 skips it entirely, 1 = on. */
  readonly uBeam1On: number;
  /** Beam 2 quad corners row-major (TL, TR, BL, BR), flat [x0,y0, ...]. */
  readonly uBeam2Poly: readonly number[];
  /** Beam 2 color. */
  readonly uBeam2Color: RGB;
  /** Beam 2 fill strength (absolute). */
  readonly uBeam2Alpha: number;
  /** Beam 2 on/off; 0 skips it entirely, 1 = on. */
  readonly uBeam2On: number;
  /** Beam 3 quad corners row-major (TL, TR, BL, BR), flat [x0,y0, ...]. */
  readonly uBeam3Poly: readonly number[];
  /** Beam 3 color. */
  readonly uBeam3Color: RGB;
  /** Beam 3 fill strength (absolute). */
  readonly uBeam3Alpha: number;
  /** Beam 3 on/off; 0 skips it entirely, 1 = on. */
  readonly uBeam3On: number;
  /** Mote brightness (absolute). */
  readonly uMoteAlpha: number;
  /** Mote glow radius, in mote-size multiples. */
  readonly uGlowSize: number;
  /** Active motes (<= 128); fewer = cheaper. */
  readonly uMoteCount: number;
};

// Per-beam control triples, generated so beam 1/2/3 stay identical in shape.
const beamControls = (
  n: 1 | 2 | 3,
  poly: readonly number[],
  color: RGB,
  alpha: number,
): readonly UniformControl[] => [
  { name: `uBeam${n}On`, kind: 'switch', default: 1, doc: `Beam ${n} on/off (0 skips it).` },
  { name: `uBeam${n}Color`, kind: 'color', default: color, doc: `Beam ${n} color.` },
  {
    name: `uBeam${n}Alpha`,
    kind: 'float',
    default: alpha,
    min: 0,
    max: 1,
    step: 0.01,
    doc: `Beam ${n} fill strength.`,
  },
  {
    name: `uBeam${n}Poly`,
    kind: 'polygon',
    points: 4,
    default: poly,
    doc: `Beam ${n} corners row-major (TL, TR, BL, BR), y-up.`,
  },
];

/** The `light-beams-and-motes` shader's tunable uniforms; defaults reproduce the stock look. */
export const LIGHT_BEAMS_AND_MOTES_CONTROLS: readonly UniformControl[] = [
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
  ...beamControls(1, [0.02, 1.05, 0.17, 1.05, 0.36, 0, 0.68, 0], [1.0, 0.42, 0.32], 0.13),
  ...beamControls(2, [0.45, 1.05, 0.57, 1.05, 0.33, 0, 0.73, 0], [0.54, 1.0, 0.62], 0.086),
  ...beamControls(3, [0.82, 1.05, 0.99, 1.05, 0.38, 0, 0.7, 0], [0.55, 0.66, 1.0], 0.104),
  {
    name: 'uMoteCount',
    kind: 'float',
    default: 128,
    min: 0,
    max: 128,
    step: 1,
    doc: 'Active motes (fewer = cheaper).',
  },
  {
    name: 'uMoteAlpha',
    kind: 'float',
    default: 0.48,
    min: 0,
    max: 2,
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
];
