// Generative layer-shader sources for the web composite compositor, keyed by the
// shader name the compositor dispatches on. Single-sourced from the canonical
// `shaders/<name>.frag` via `bun run build:shaders`, which emits the name ->
// source registry. The compositor reads this directly, so adding a generative to
// GENERATIVE_SHADERS registers it on web with no edit here.
export { SHADER_SOURCES as LAYER_SHADER_SOURCES } from '../shaders.generated';
