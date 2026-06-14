// Per-shader interface barrel. Each layer shader exports its typed uniforms and
// a control descriptor (the runtime metadata the demo generates tuning controls
// from, and the shader's documentation). The per-shader `*_CONTROLS` are
// re-exported individually; a consumer imports the one its preset's layer needs.

import type { AnamorphicLensFlareUniforms } from './anamorphic-lensflare/anamorphic-lensflare';
import type { AuroraSilkUniforms } from './aurora-silk/aurora-silk';
import type { BlurUniforms } from './blur/blur';
import type { CloudsUniforms } from './clouds/clouds';
import type { CorporateBlobsUniforms } from './corporate-blobs/corporate-blobs';
import type { DataMeshUniforms } from './data-mesh/data-mesh';
import type { FirefliesUniforms } from './fireflies/fireflies';
import type { GodraysUniforms } from './godrays/godrays';
import type { HalftoneWavesUniforms } from './halftone-waves/halftone-waves';
import type { KaleidoscopeShaderUniforms } from './kaleidoscope/kaleidoscope';
import type { LightBeamsAndMotesUniforms } from './light-beams-and-motes/light-beams-and-motes';
import type { NebulaUniforms } from './nebula/nebula';
import type { NeoMemphisUniforms } from './neo-memphis/neo-memphis';
import type { OutrunGridUniforms } from './outrun-grid/outrun-grid';
import type { PlasmaUniforms } from './plasma/plasma';
import type { SimianlightsUniforms } from './simianlights/simianlights';

export { defaultUniforms, type UniformControl } from './_shared/types';
export type { AnamorphicLensFlareUniforms } from './anamorphic-lensflare/anamorphic-lensflare';
export { ANAMORPHIC_LENSFLARE_CONTROLS } from './anamorphic-lensflare/anamorphic-lensflare';
export type { AuroraSilkUniforms } from './aurora-silk/aurora-silk';
export { AURORA_SILK_CONTROLS } from './aurora-silk/aurora-silk';
export type { BlurUniforms } from './blur/blur';
export { BLUR_CONTROLS } from './blur/blur';
export type { CloudsUniforms } from './clouds/clouds';
export { CLOUDS_CONTROLS } from './clouds/clouds';
export type { CorporateBlobsUniforms } from './corporate-blobs/corporate-blobs';
export { CORPORATE_BLOBS_CONTROLS } from './corporate-blobs/corporate-blobs';
export type { DataMeshUniforms } from './data-mesh/data-mesh';
export { DATA_MESH_CONTROLS } from './data-mesh/data-mesh';
export type { FirefliesUniforms } from './fireflies/fireflies';
export { FIREFLIES_CONTROLS } from './fireflies/fireflies';
export type { GodraysUniforms } from './godrays/godrays';
export { GODRAYS_CONTROLS } from './godrays/godrays';
export type { HalftoneWavesUniforms } from './halftone-waves/halftone-waves';
export { HALFTONE_WAVES_CONTROLS } from './halftone-waves/halftone-waves';
export type { KaleidoscopeShaderUniforms } from './kaleidoscope/kaleidoscope';
export { KALEIDOSCOPE_CONTROLS } from './kaleidoscope/kaleidoscope';
export type { LightBeamsAndMotesUniforms } from './light-beams-and-motes/light-beams-and-motes';
export { LIGHT_BEAMS_AND_MOTES_CONTROLS } from './light-beams-and-motes/light-beams-and-motes';
export type { NebulaUniforms } from './nebula/nebula';
export { NEBULA_CONTROLS } from './nebula/nebula';
export type { NeoMemphisUniforms } from './neo-memphis/neo-memphis';
export { NEO_MEMPHIS_CONTROLS } from './neo-memphis/neo-memphis';
export type { OutrunGridUniforms } from './outrun-grid/outrun-grid';
export { OUTRUN_GRID_CONTROLS } from './outrun-grid/outrun-grid';
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
  readonly kaleidoscope: KaleidoscopeShaderUniforms;
  readonly 'halftone-waves': HalftoneWavesUniforms;
  readonly plasma: PlasmaUniforms;
  readonly nebula: NebulaUniforms;
  readonly 'neo-memphis': NeoMemphisUniforms;
  readonly 'outrun-grid': OutrunGridUniforms;
  readonly simianlights: SimianlightsUniforms;
  readonly 'anamorphic-lensflare': AnamorphicLensFlareUniforms;
  readonly 'aurora-silk': AuroraSilkUniforms;
  readonly 'light-beams-and-motes': LightBeamsAndMotesUniforms;
  readonly 'corporate-blobs': CorporateBlobsUniforms;
  readonly 'data-mesh': DataMeshUniforms;
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
