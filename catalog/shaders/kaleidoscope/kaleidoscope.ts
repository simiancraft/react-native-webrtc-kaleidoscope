// Kaleidoscope layer-shader interface: typed uniforms + control descriptor.
// The library's namesake: a mirrored polar fold over a drifting sine field, an
// opaque BACKGROUND layer (issue #61). One kaleidoscope.frag fans out into the
// book presets (stained-glass, mandala, prism) by varying these uniforms; the
// segment count and palette are the big levers. Shader source is
// shaders/kaleidoscope.frag.

// Cost: CHEAP -- ~0.96 ms/draw, ~3.3x plasma (shader:view meter
// @1920, Intel UHD 770, default uniforms, 2026-06-14).
// Rubric + full ranking: ../README.md ("Cost").
import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `kaleidoscope` layer shader. */
export type KaleidoscopeShaderUniforms = {
  /** Base palette color; also the pole uCalm eases toward. */
  readonly uColorA: RGB;
  /** Second palette color. */
  readonly uColorB: RGB;
  /** Accent color layered over the A/B field. */
  readonly uColorC: RGB;
  /** Mirror segment count; 6 = bold facets, 12 = lace. */
  readonly uSegments: number;
  /** Source-field drift rate; 0 freezes the pattern. */
  readonly uSpeed: number;
  /** Whole-field rotation rate; sign sets direction. */
  readonly uRotate: number;
  /** Pattern scale; higher = more rings of detail. */
  readonly uZoom: number;
  /** Eases contrast at frame center (the face zone); 0 = off. */
  readonly uCalm: number;
};

/** The `kaleidoscope` shader's tunables; defaults are the "stained glass" look. */
export const KALEIDOSCOPE_CONTROLS: readonly UniformControl[] = [
  { name: 'uColorA', kind: 'color', default: [0.07, 0.15, 0.36], doc: 'Base palette color.' },
  { name: 'uColorB', kind: 'color', default: [0.1, 0.55, 0.62], doc: 'Second palette color.' },
  { name: 'uColorC', kind: 'color', default: [0.93, 0.69, 0.21], doc: 'Accent color.' },
  {
    name: 'uSegments',
    kind: 'float',
    default: 8,
    min: 3,
    max: 16,
    step: 1,
    doc: 'Mirror segment count; 6 = bold facets, 12 = lace.',
  },
  {
    name: 'uSpeed',
    kind: 'float',
    default: 0.35,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Drift rate; 0 freezes.',
  },
  {
    name: 'uRotate',
    kind: 'float',
    default: 0.04,
    min: -0.5,
    max: 0.5,
    step: 0.005,
    doc: 'Whole-field rotation rate; sign sets direction.',
  },
  {
    name: 'uZoom',
    kind: 'float',
    default: 1.6,
    min: 0.5,
    max: 4,
    step: 0.05,
    doc: 'Pattern scale; higher = more rings of detail.',
  },
  {
    name: 'uCalm',
    kind: 'float',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Eases contrast at frame center (face zone).',
  },
];
