// Web variant: the preset source is already a bundled image URL, so the
// thumbnail URI is the source itself.

import type { ResolveBackgroundUri } from './resolve-background-uri.types';

export const resolveBackgroundUri: ResolveBackgroundUri = (_id, source) => source;
