// Deep link: a shareable URL that addresses one preset in the book. Its params
// are the taxonomy axes plus the leaf (group, category, item) or a direct preset
// id. Two concerns, kept apart: READING the params from the environment (web has
// a URL, native does not) is platform-split (deep-link.ts / deep-link.web.ts);
// RESOLVING params to a preset id (with per-level fallback) is pure and shared
// (deep-link-resolve.ts).

/**
 * Deep-link params parsed from a URL. All optional; an all-empty value means no
 * deep-link intent, so the persisted selection stays in charge.
 */
export type DeepLinkParams = {
  /** Exact preset id, the canonical share form (e.g. "data-mesh-datafield"). */
  readonly preset?: string;
  /** taxonomy[0] (the tab/family), matched slug-insensitively. */
  readonly group?: string;
  /** taxonomy[1] (the category), matched slug-insensitively. */
  readonly category?: string;
  /** The leaf preset within the resolved category, by id or name. */
  readonly item?: string;
};

/** Read the deep-link params from the environment (the URL on web; none native). */
export type ReadDeepLink = () => DeepLinkParams;

/**
 * Reflect a selection back into the URL so it is copy-pasteable. Takes the
 * derived params (group, category, item) for the selected preset, or null to
 * clear them. Use presetToParams() in deep-link-resolve.ts to derive them.
 */
export type WriteDeepLink = (params: DeepLinkParams | null) => void;
