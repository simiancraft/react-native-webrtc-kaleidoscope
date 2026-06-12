// Neo-Memphis layer-shader interface: typed uniforms + control descriptor.
// Scattered flat-color geometric primitives (the 90s Memphis / "Jazz cup"
// pattern family), an opaque BACKGROUND layer (issue #61). One
// neo-memphis.frag fans out into the book presets (jazz-cup, bauhaus,
// confetti) by varying these uniforms; the palette is the big lever. Shader
// source is shaders/neo-memphis.frag.

import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `neo-memphis` layer shader. */
export type NeoMemphisUniforms = {
  /** Field color behind the shapes. */
  readonly uBgColor: RGB;
  /** Shape palette color 1. */
  readonly uColorA: RGB;
  /** Shape palette color 2. */
  readonly uColorB: RGB;
  /** Shape palette color 3. */
  readonly uColorC: RGB;
  /** Hero-grid cells across frame height; higher = smaller, busier shapes. */
  readonly uScale: number;
  /** Probability a cell draws its shape; the busy-ness dial. */
  readonly uDensity: number;
  /** Probability a shape renders outlined instead of filled. */
  readonly uOutline: number;
  /** Scroll + rotation rate; 0 freezes. */
  readonly uDrift: number;
  /** Fades shapes near frame center (the face zone); 0 = off. */
  readonly uCalm: number;
};

/** The `neo-memphis` shader's tunables; defaults are the "pastel studio" look. */
export const NEO_MEMPHIS_CONTROLS: readonly UniformControl[] = [
  { name: 'uBgColor', kind: 'color', default: [0.96, 0.94, 0.89], doc: 'Field color.' },
  { name: 'uColorA', kind: 'color', default: [0.16, 0.62, 0.56], doc: 'Shape palette color 1.' },
  { name: 'uColorB', kind: 'color', default: [0.91, 0.45, 0.45], doc: 'Shape palette color 2.' },
  { name: 'uColorC', kind: 'color', default: [0.27, 0.32, 0.55], doc: 'Shape palette color 3.' },
  {
    name: 'uScale',
    kind: 'float',
    default: 4,
    min: 2,
    max: 10,
    step: 0.5,
    doc: 'Hero-grid cells across frame height.',
  },
  {
    name: 'uDensity',
    kind: 'float',
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Probability a cell draws; busy-ness.',
  },
  {
    name: 'uOutline',
    kind: 'float',
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Share of outlined vs filled shapes.',
  },
  {
    name: 'uDrift',
    kind: 'float',
    default: 0.5,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Scroll + spin rate; 0 freezes.',
  },
  {
    name: 'uCalm',
    kind: 'float',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Fades shapes at frame center (face zone).',
  },
];
