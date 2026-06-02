// Corporate-blobs layer-shader interface: typed uniforms + control descriptor. A
// transparent overlay of large decorative edge/vignette blobs in flat brand
// colors, drifting and morphing (premultiplied output; the blobs sit over
// whatever is beneath). Shader source is shaders/corporate-blobs.frag. The eight
// blobs' positions and colors are fixed in the shader; the tunables below grade,
// scale, and pace the field. Defaults reproduce the stock prototype look.

import type { RGB } from '../../src/types';
import type { UniformControl } from '../_shared/types';

/** Typed uniforms for the `corporate-blobs` layer shader. */
export type CorporateBlobsUniforms = {
  /** Overall tint / color grade, multiplied over every blob; [1,1,1] = no grade. */
  readonly uColor: RGB;
  /** Blob 1 base color (stock: light blue). */
  readonly uBlobColor1: RGB;
  /** Blob 2 base color (stock: dark green). */
  readonly uBlobColor2: RGB;
  /** Blob 3 base color (stock: yellow). */
  readonly uBlobColor3: RGB;
  /** Blob 4 base color (stock: orange). */
  readonly uBlobColor4: RGB;
  /** Blob 5 base color (stock: light green). */
  readonly uBlobColor5: RGB;
  /** Blob 6 base color (stock: magenta). */
  readonly uBlobColor6: RGB;
  /** Blob 7 base color (stock: brown). */
  readonly uBlobColor7: RGB;
  /** Blob 8 base color (stock: dark blue). */
  readonly uBlobColor8: RGB;
  /** Overall blob opacity; stock 0.58. */
  readonly uGlobalAlpha: number;
  /** Global blob size multiplier; stock 2.55. */
  readonly uScale: number;
  /** Pushes blobs outward from center; stock 0.32. */
  readonly uEdgePull: number;
  /** Radius around center that repels blobs; stock 0.42. */
  readonly uCenterClear: number;
  /** Positional drift magnitude; 1 = stock, 0 holds blobs still. */
  readonly uMotionAmount: number;
  /** Drift + morph rate; 1 = stock, 0 freezes motion. */
  readonly uMotionSpeed: number;
  /** Blob edge falloff; stock 0.024. */
  readonly uEdgeSoftness: number;
};

/** The `corporate-blobs` shader's tunable uniforms; defaults reproduce the stock look. */
export const CORPORATE_BLOBS_CONTROLS: readonly UniformControl[] = [
  { name: 'uColor', kind: 'color', default: [1, 1, 1], doc: 'Overall tint / color grade.' },
  {
    name: 'uBlobColor1',
    kind: 'color',
    default: [0.376, 0.647, 0.98],
    doc: 'Blob 1 (light blue).',
  },
  {
    name: 'uBlobColor2',
    kind: 'color',
    default: [0.063, 0.725, 0.506],
    doc: 'Blob 2 (dark green).',
  },
  { name: 'uBlobColor3', kind: 'color', default: [0.984, 0.749, 0.141], doc: 'Blob 3 (yellow).' },
  { name: 'uBlobColor4', kind: 'color', default: [0.976, 0.451, 0.086], doc: 'Blob 4 (orange).' },
  {
    name: 'uBlobColor5',
    kind: 'color',
    default: [0.133, 0.773, 0.369],
    doc: 'Blob 5 (light green).',
  },
  { name: 'uBlobColor6', kind: 'color', default: [0.851, 0.275, 0.937], doc: 'Blob 6 (magenta).' },
  { name: 'uBlobColor7', kind: 'color', default: [0.341, 0.325, 0.306], doc: 'Blob 7 (brown).' },
  { name: 'uBlobColor8', kind: 'color', default: [0.008, 0.518, 0.78], doc: 'Blob 8 (dark blue).' },
  {
    name: 'uGlobalAlpha',
    kind: 'float',
    default: 0.58,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Overall blob opacity.',
  },
  {
    name: 'uScale',
    kind: 'float',
    default: 2.55,
    min: 1,
    max: 4,
    step: 0.01,
    doc: 'Global blob size.',
  },
  {
    name: 'uEdgePull',
    kind: 'float',
    default: 0.32,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Outward push from center.',
  },
  {
    name: 'uCenterClear',
    kind: 'float',
    default: 0.42,
    min: 0,
    max: 1,
    step: 0.01,
    doc: 'Center clear radius.',
  },
  {
    name: 'uMotionAmount',
    kind: 'float',
    default: 1,
    min: 0,
    max: 3,
    step: 0.01,
    doc: 'Drift magnitude; 0 holds still.',
  },
  {
    name: 'uMotionSpeed',
    kind: 'float',
    default: 1,
    min: 0,
    max: 3,
    step: 0.01,
    doc: 'Drift + morph rate; 0 freezes.',
  },
  {
    name: 'uEdgeSoftness',
    kind: 'float',
    default: 0.024,
    min: 0.005,
    max: 0.1,
    step: 0.001,
    doc: 'Blob edge falloff.',
  },
];
