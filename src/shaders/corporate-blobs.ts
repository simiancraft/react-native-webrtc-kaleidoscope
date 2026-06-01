// Corporate-blobs layer-shader interface: typed uniforms + control descriptor. A
// transparent overlay of large decorative edge/vignette blobs in flat brand
// colors, drifting and morphing (premultiplied output; the blobs sit over
// whatever is beneath). Shader source is shaders/corporate-blobs.frag. The eight
// blobs' positions and colors are fixed in the shader; the tunables below grade,
// scale, and pace the field. Defaults reproduce the stock prototype look.

import type { RGB } from '../types';
import type { UniformControl } from './types';

/** Typed uniforms for the `corporate-blobs` layer shader. */
export type CorporateBlobsUniforms = {
  /** Overall tint / color grade; [1,1,1] keeps the stock brand colors. */
  readonly uColor: RGB;
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
