// Web variant: the preset source is already a bundled image URL, so the
// thumbnail URI is the source itself.
//
// How this file gets picked over the native sibling: Metro resolves the bare
// `../resolve-image-uri` import to `.web.ts` via platform extensions; for
// non-Metro dist consumers it is selected by the top-level `browser` FIELD remap
// in package.json (dist/.../resolve-image-uri.js -> .web.js). That is a
// different mechanism than the `backgrounds/*` subpath `exports` browser
// CONDITIONS, because this file is reached by an internal relative import, not a
// subpath export. Adding another platform-split file under src/ui consumed via a
// bare import means extending that `browser` field, not adding an exports entry.

import type { ResolveImageUri } from './resolve-image-uri.types';

export const resolveImageUri: ResolveImageUri = (_id, source) => source;
