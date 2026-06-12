// Aurora-silk layer-shader interface: typed uniforms + control descriptor.
// Noise-warped ribbon bands over a two-stop gradient (OS-swoosh through SaaS
// gradient), an opaque BACKGROUND layer (issue #61). One aurora-silk.frag
// fans out into the book presets (corporate-silk, dusk, polar) by varying
// these uniforms; the palette and uStyle are the big levers. Shader source is
// shaders/aurora-silk.frag.

import type { RGB } from '../../../src/lib/primitives.types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `aurora-silk` layer shader. */
export type AuroraSilkUniforms = {
  /** Gradient color at the flow's low side. */
  readonly uColorLow: RGB;
  /** Gradient color at the flow's high side. */
  readonly uColorHigh: RGB;
  /** Ribbon tint; back-of-stack ribbons shade toward uColorHigh. */
  readonly uRibbonColor: RGB;
  /** Visible ribbon count, 1..5. */
  readonly uRibbons: number;
  /** Ribbon edge softness; 0 = paper-cut crisp, 1 = fully diffuse. */
  readonly uSoftness: number;
  /** Flow direction in radians. */
  readonly uAngle: number;
  /** Drift rate; 0 freezes. */
  readonly uSpeed: number;
  /** Aesthetic morph: 0 flat paper-cut, 1 glowing silk. */
  readonly uStyle: number;
  /** Eases ribbons at frame center (the face zone); 0 = off. */
  readonly uCalm: number;
};

/** The `aurora-silk` shader's tunables; defaults are the "corporate silk" look. */
export const AURORA_SILK_CONTROLS: readonly UniformControl[] = [
  { name: 'uColorLow', kind: 'color', default: [0.08, 0.11, 0.22], doc: 'Gradient low color.' },
  { name: 'uColorHigh', kind: 'color', default: [0.16, 0.29, 0.48], doc: 'Gradient high color.' },
  { name: 'uRibbonColor', kind: 'color', default: [0.36, 0.62, 0.85], doc: 'Ribbon tint.' },
  {
    name: 'uRibbons',
    kind: 'float',
    default: 4,
    min: 1,
    max: 5,
    step: 1,
    doc: 'Visible ribbon count.',
  },
  {
    name: 'uSoftness',
    kind: 'float',
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Ribbon edge softness; 0 = paper-cut.',
  },
  {
    name: 'uAngle',
    kind: 'float',
    default: 0.5,
    min: 0,
    max: 6.28,
    step: 0.01,
    doc: 'Flow direction, radians.',
  },
  {
    name: 'uSpeed',
    kind: 'float',
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.01,
    doc: 'Drift rate; 0 freezes.',
  },
  {
    name: 'uStyle',
    kind: 'float',
    default: 0.8,
    min: 0,
    max: 1,
    step: 0.01,
    doc: '0 flat paper-cut, 1 glowing silk.',
  },
  {
    name: 'uCalm',
    kind: 'float',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Eases ribbons at frame center (face zone).',
  },
];
