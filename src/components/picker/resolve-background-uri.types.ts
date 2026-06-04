// Shared contract for the platform-split thumbnail resolver. No runtime imports
// from platform-specific packages (web and native variants both import this).

/**
 * Resolve a displayable thumbnail source for a preset.
 * - Web: the preset `source` is already a usable image URL; returned as-is.
 * - Native: the bundled WebP lives at a conventional in-bundle location; the
 *   native module returns a `file://` URI for it (no second copy of the image).
 *   When `source` is a `number` (a Metro asset module id), it bypasses the
 *   native module and is returned as-is so `<Image source={number}>` can load
 *   it directly through Metro's asset pipeline.
 * Returns `undefined` when no thumbnail can be resolved (the tile shows just its
 * label).
 */
export type ResolveBackgroundUri = (
  id: string,
  source: string | number | undefined,
) => string | number | undefined;
