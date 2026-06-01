// Per-shader interface barrel. Each layer shader exports its typed uniforms and
// a control descriptor (the runtime metadata the demo generates tuning controls
// from, and the shader's documentation). LAYER_CONTROLS is the registry the demo
// reads to show controls for whatever tunable layers the active scene contains.

import { ANAMORPHIC_LENSFLARE_CONTROLS } from './anamorphic-lensflare';
import { CLOUDS_CONTROLS } from './clouds';
import { FIREFLIES_CONTROLS } from './fireflies';
import { GODRAYS_CONTROLS } from './godrays';
import { NEBULA_CONTROLS } from './nebula';
import { PLASMA_CONTROLS } from './plasma';
import { SIMIANLIGHTS_CONTROLS } from './simianlights';
import type { UniformControl } from './types';

export type { AnamorphicLensFlareUniforms } from './anamorphic-lensflare';
export { ANAMORPHIC_LENSFLARE_CONTROLS } from './anamorphic-lensflare';
export type { CloudsUniforms } from './clouds';
export { CLOUDS_CONTROLS } from './clouds';
export type { FirefliesUniforms } from './fireflies';
export { FIREFLIES_CONTROLS } from './fireflies';
export type { GodraysUniforms } from './godrays';
export { GODRAYS_CONTROLS } from './godrays';
export type { NebulaUniforms } from './nebula';
export { NEBULA_CONTROLS } from './nebula';
export type { PlasmaUniforms } from './plasma';
export { PLASMA_CONTROLS } from './plasma';
export type { SimianlightsUniforms } from './simianlights';
export { SIMIANLIGHTS_CONTROLS } from './simianlights';
export { defaultUniforms, type UniformControl } from './types';

/**
 * Tunable layer shaders → their control descriptors. The demo renders one control
 * panel per tunable layer in the active scene by looking each layer's shader name
 * up here. `image`/`direct` have no tunable uniforms, so they're absent.
 */
export const LAYER_CONTROLS: Readonly<Record<string, readonly UniformControl[]>> = {
  clouds: CLOUDS_CONTROLS,
  godrays: GODRAYS_CONTROLS,
  fireflies: FIREFLIES_CONTROLS,
  plasma: PLASMA_CONTROLS,
  nebula: NEBULA_CONTROLS,
  simianlights: SIMIANLIGHTS_CONTROLS,
  'anamorphic-lensflare': ANAMORPHIC_LENSFLARE_CONTROLS,
};
