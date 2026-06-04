// Web variant: the preset source is already a bundled image URL, so the
// thumbnail URI is the source itself.
//
// How this file gets picked over the native sibling: Metro resolves the bare
// `../resolve-thumbnail-uri` import to `.web.ts` via platform extensions; for
// non-Metro dist consumers it is selected by the top-level `browser` FIELD remap
// in package.json (dist/.../resolve-thumbnail-uri.js -> .web.js). That is a
// different mechanism than the `backgrounds/*` subpath `exports` browser
// CONDITIONS, because this file is reached by an internal relative import, not a
// subpath export. Adding another platform-split file under src/ui consumed via a
// bare import means extending that `browser` field, not adding an exports entry.

import type { ResolveThumbnailUri } from './resolve-thumbnail-uri.types';

export const resolveThumbnailUri: ResolveThumbnailUri = (_id, source) => source;
