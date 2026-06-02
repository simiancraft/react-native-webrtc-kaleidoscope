// Generative layer-shader sources for the web composite compositor, keyed by the
// shader name the compositor dispatches on. Single-sourced from the canonical
// `shaders/<name>.frag` via `bun run build:shaders`; this module only maps the
// generated consts to their dispatch names. Previously these were hand-mirrored
// inline here, which could drift from the .frag the iOS transpile uses.
import {
  ANAMORPHIC_LENSFLARE_FRAG_SRC,
  CLOUDS_FRAG_SRC,
  CORPORATE_BLOBS_FRAG_SRC,
  FIREFLIES_FRAG_SRC,
  GODRAYS_FRAG_SRC,
  LIGHT_BEAMS_AND_MOTES_FRAG_SRC,
  NEBULA_FRAG_SRC,
  PLASMA_FRAG_SRC,
  SIMIANLIGHTS_FRAG_SRC,
} from '../shaders.generated';

export const LAYER_SHADER_SOURCES: Readonly<Record<string, string>> = {
  godrays: GODRAYS_FRAG_SRC,
  clouds: CLOUDS_FRAG_SRC,
  fireflies: FIREFLIES_FRAG_SRC,
  plasma: PLASMA_FRAG_SRC,
  nebula: NEBULA_FRAG_SRC,
  simianlights: SIMIANLIGHTS_FRAG_SRC,
  'anamorphic-lensflare': ANAMORPHIC_LENSFLARE_FRAG_SRC,
  'light-beams-and-motes': LIGHT_BEAMS_AND_MOTES_FRAG_SRC,
  'corporate-blobs': CORPORATE_BLOBS_FRAG_SRC,
};
