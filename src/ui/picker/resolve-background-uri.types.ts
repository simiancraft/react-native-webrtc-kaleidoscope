// Shared contract for the platform-split thumbnail resolver. No runtime imports
// from platform-specific packages (web and native variants both import this).

/**
 * Resolve a displayable thumbnail URI for a background preset.
 * - Web: the preset `source` is already a usable image URL; returned as-is.
 * - Native: the bundled WebP lives at a conventional in-bundle location; the
 *   native module returns a `file://` URI for it (no second copy of the image).
 * Returns `undefined` when no thumbnail can be resolved (the tile shows just its
 * label).
 */
export type ResolveBackgroundUri = (id: string, source: string | undefined) => string | undefined;
