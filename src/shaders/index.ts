// Per-shader interface barrel. Each layer shader exports its typed uniforms and
// a control descriptor (the runtime metadata the demo generates tuning controls
// from, and the shader's documentation). LAYER_CONTROLS is the registry the demo
// reads to show controls for whatever tunable layers the active scene contains.

import type { AnamorphicLensFlareUniforms } from './anamorphic-lensflare';
import { ANAMORPHIC_LENSFLARE_CONTROLS } from './anamorphic-lensflare';
import type { BlurUniforms } from './blur';
import { BLUR_CONTROLS } from './blur';
import type { CloudsUniforms } from './clouds';
import { CLOUDS_CONTROLS } from './clouds';
import type { CorporateBlobsUniforms } from './corporate-blobs';
import { CORPORATE_BLOBS_CONTROLS } from './corporate-blobs';
import type { FirefliesUniforms } from './fireflies';
import { FIREFLIES_CONTROLS } from './fireflies';
import type { GodraysUniforms } from './godrays';
import { GODRAYS_CONTROLS } from './godrays';
import type { LightBeamsAndMotesUniforms } from './light-beams-and-motes';
import { LIGHT_BEAMS_AND_MOTES_CONTROLS } from './light-beams-and-motes';
import type { NebulaUniforms } from './nebula';
import { NEBULA_CONTROLS } from './nebula';
import type { PlasmaUniforms } from './plasma';
import { PLASMA_CONTROLS } from './plasma';
import type { SimianlightsUniforms } from './simianlights';
import { SIMIANLIGHTS_CONTROLS } from './simianlights';
import type { UniformControl } from './types';

export type { AnamorphicLensFlareUniforms } from './anamorphic-lensflare';
export { ANAMORPHIC_LENSFLARE_CONTROLS } from './anamorphic-lensflare';
export type { BlurUniforms } from './blur';
export { BLUR_CONTROLS } from './blur';
export type { CloudsUniforms } from './clouds';
export { CLOUDS_CONTROLS } from './clouds';
export type { CorporateBlobsUniforms } from './corporate-blobs';
export { CORPORATE_BLOBS_CONTROLS } from './corporate-blobs';
export type { FirefliesUniforms } from './fireflies';
export { FIREFLIES_CONTROLS } from './fireflies';
export type { GodraysUniforms } from './godrays';
export { GODRAYS_CONTROLS } from './godrays';
export type { LightBeamsAndMotesUniforms } from './light-beams-and-motes';
export { LIGHT_BEAMS_AND_MOTES_CONTROLS } from './light-beams-and-motes';
export type { NebulaUniforms } from './nebula';
export { NEBULA_CONTROLS } from './nebula';
export type { PlasmaUniforms } from './plasma';
export { PLASMA_CONTROLS } from './plasma';
export type { SimianlightsUniforms } from './simianlights';
export { SIMIANLIGHTS_CONTROLS } from './simianlights';
export { defaultUniforms, type UniformControl } from './types';

/**
 * The uniform-bearing layer shaders → their typed uniforms. `image` and `direct`
 * carry no uniforms, so they are absent. This is the map a `LayerPatch` narrows
 * over: `{ shader: 'plasma', uniforms }` types `uniforms` as `Partial<PlasmaUniforms>`,
 * giving authors IntelliSense on a `kaleidoscope(id, patches)` call.
 */
export type ShaderUniformsMap = {
  readonly blur: BlurUniforms;
  readonly clouds: CloudsUniforms;
  readonly godrays: GodraysUniforms;
  readonly fireflies: FirefliesUniforms;
  readonly plasma: PlasmaUniforms;
  readonly nebula: NebulaUniforms;
  readonly simianlights: SimianlightsUniforms;
  readonly 'anamorphic-lensflare': AnamorphicLensFlareUniforms;
  readonly 'light-beams-and-motes': LightBeamsAndMotesUniforms;
  readonly 'corporate-blobs': CorporateBlobsUniforms;
};

/** A patchable (uniform-bearing) layer shader name. */
export type PatchableShaderName = keyof ShaderUniformsMap;

/**
 * Tunable layer shaders → their control descriptors. The demo renders one control
 * panel per tunable layer in the active scene by looking each layer's shader name
 * up here. `image`/`direct` have no tunable uniforms, so they're absent.
 */
export const LAYER_CONTROLS: Readonly<Record<string, readonly UniformControl[]>> = {
  blur: BLUR_CONTROLS,
  clouds: CLOUDS_CONTROLS,
  godrays: GODRAYS_CONTROLS,
  fireflies: FIREFLIES_CONTROLS,
  plasma: PLASMA_CONTROLS,
  nebula: NEBULA_CONTROLS,
  simianlights: SIMIANLIGHTS_CONTROLS,
  'anamorphic-lensflare': ANAMORPHIC_LENSFLARE_CONTROLS,
  'light-beams-and-motes': LIGHT_BEAMS_AND_MOTES_CONTROLS,
  'corporate-blobs': CORPORATE_BLOBS_CONTROLS,
};
