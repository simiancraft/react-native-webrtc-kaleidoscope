// Per-shader interface barrel. Each layer shader exports its typed uniforms and
// a control descriptor (the runtime metadata the demo generates tuning controls
// from, and the shader's documentation). The per-shader `*_CONTROLS` are
// re-exported individually; a consumer imports the one its preset's layer needs.

import type { AnamorphicLensFlareUniforms } from '../../shaders/anamorphic-lensflare/anamorphic-lensflare';
import type { BlurUniforms } from '../../shaders/blur/blur';
import type { CloudsUniforms } from '../../shaders/clouds/clouds';
import type { CorporateBlobsUniforms } from '../../shaders/corporate-blobs/corporate-blobs';
import type { FirefliesUniforms } from '../../shaders/fireflies/fireflies';
import type { GodraysUniforms } from '../../shaders/godrays/godrays';
import type { LightBeamsAndMotesUniforms } from '../../shaders/light-beams-and-motes/light-beams-and-motes';
import type { NebulaUniforms } from '../../shaders/nebula/nebula';
import type { PlasmaUniforms } from '../../shaders/plasma/plasma';
import type { SimianlightsUniforms } from '../../shaders/simianlights/simianlights';

export { defaultUniforms, type UniformControl } from '../../shaders/_shared/types';
export type { AnamorphicLensFlareUniforms } from '../../shaders/anamorphic-lensflare/anamorphic-lensflare';
export { ANAMORPHIC_LENSFLARE_CONTROLS } from '../../shaders/anamorphic-lensflare/anamorphic-lensflare';
export type { BlurUniforms } from '../../shaders/blur/blur';
export { BLUR_CONTROLS } from '../../shaders/blur/blur';
export type { CloudsUniforms } from '../../shaders/clouds/clouds';
export { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';
export type { CorporateBlobsUniforms } from '../../shaders/corporate-blobs/corporate-blobs';
export { CORPORATE_BLOBS_CONTROLS } from '../../shaders/corporate-blobs/corporate-blobs';
export type { FirefliesUniforms } from '../../shaders/fireflies/fireflies';
export { FIREFLIES_CONTROLS } from '../../shaders/fireflies/fireflies';
export type { GodraysUniforms } from '../../shaders/godrays/godrays';
export { GODRAYS_CONTROLS } from '../../shaders/godrays/godrays';
export type { LightBeamsAndMotesUniforms } from '../../shaders/light-beams-and-motes/light-beams-and-motes';
export { LIGHT_BEAMS_AND_MOTES_CONTROLS } from '../../shaders/light-beams-and-motes/light-beams-and-motes';
export type { NebulaUniforms } from '../../shaders/nebula/nebula';
export { NEBULA_CONTROLS } from '../../shaders/nebula/nebula';
export type { PlasmaUniforms } from '../../shaders/plasma/plasma';
export { PLASMA_CONTROLS } from '../../shaders/plasma/plasma';
export type { SimianlightsUniforms } from '../../shaders/simianlights/simianlights';
export { SIMIANLIGHTS_CONTROLS } from '../../shaders/simianlights/simianlights';

/**
 * The uniform-bearing layer shaders → their typed uniforms. `image` and `direct`
 * carry no uniforms, so they are absent. This is the map `PatchFor` re-indexes by
 * a layer's literal `shader` to type its `uniforms` as `Partial<PlasmaUniforms>`,
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
