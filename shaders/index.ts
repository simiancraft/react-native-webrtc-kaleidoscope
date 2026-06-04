// Per-shader interface barrel. Each layer shader exports its typed uniforms and
// a control descriptor (the runtime metadata the demo generates tuning controls
// from, and the shader's documentation). The per-shader `*_CONTROLS` are
// re-exported individually; a consumer imports the one its preset's layer needs.

import type { AnamorphicLensFlareUniforms } from './anamorphic-lensflare/anamorphic-lensflare';
import type { BlurUniforms } from './blur/blur';
import type { CloudsUniforms } from './clouds/clouds';
import type { CorporateBlobsUniforms } from './corporate-blobs/corporate-blobs';
import type { FirefliesUniforms } from './fireflies/fireflies';
import type { GodraysUniforms } from './godrays/godrays';
import type { LightBeamsAndMotesUniforms } from './light-beams-and-motes/light-beams-and-motes';
import type { NebulaUniforms } from './nebula/nebula';
import type { PlasmaUniforms } from './plasma/plasma';
import type { SimianlightsUniforms } from './simianlights/simianlights';

export { defaultUniforms, type UniformControl } from './_shared/types';
export type { AnamorphicLensFlareUniforms } from './anamorphic-lensflare/anamorphic-lensflare';
export { ANAMORPHIC_LENSFLARE_CONTROLS } from './anamorphic-lensflare/anamorphic-lensflare';
export type { BlurUniforms } from './blur/blur';
export { BLUR_CONTROLS } from './blur/blur';
export type { CloudsUniforms } from './clouds/clouds';
export { CLOUDS_CONTROLS } from './clouds/clouds';
export type { CorporateBlobsUniforms } from './corporate-blobs/corporate-blobs';
export { CORPORATE_BLOBS_CONTROLS } from './corporate-blobs/corporate-blobs';
export type { FirefliesUniforms } from './fireflies/fireflies';
export { FIREFLIES_CONTROLS } from './fireflies/fireflies';
export type { GodraysUniforms } from './godrays/godrays';
export { GODRAYS_CONTROLS } from './godrays/godrays';
export type { LightBeamsAndMotesUniforms } from './light-beams-and-motes/light-beams-and-motes';
export { LIGHT_BEAMS_AND_MOTES_CONTROLS } from './light-beams-and-motes/light-beams-and-motes';
export type { NebulaUniforms } from './nebula/nebula';
export { NEBULA_CONTROLS } from './nebula/nebula';
export type { PlasmaUniforms } from './plasma/plasma';
export { PLASMA_CONTROLS } from './plasma/plasma';
export type { SimianlightsUniforms } from './simianlights/simianlights';
export { SIMIANLIGHTS_CONTROLS } from './simianlights/simianlights';

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

/**
 * What each layer `shader` accepts in a preset, DERIVED from `ShaderUniformsMap`
 * so adding a shader there flows through automatically (no hand-mirrored list):
 * every uniform-bearing shader's options are a `Partial` of its uniforms, plus
 * the two non-uniform layer kinds. The `KaleidoscopeLayer` discriminant narrows
 * over this.
 *   - `image`  replaces the target with a still image (needs `source`).
 *   - `direct` passes the target through unchanged (a matrix passthrough).
 */
export type LayerShaderOptions = {
  readonly image: { readonly source: string };
  readonly direct: Record<never, never>;
} & {
  readonly [K in keyof ShaderUniformsMap]: { readonly uniforms: Partial<ShaderUniformsMap[K]> };
};

/** A layer shader name (the `KaleidoscopeLayer` discriminant). */
export type LayerShaderName = keyof LayerShaderOptions;
