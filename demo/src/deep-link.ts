// Native default: no pasteable URL, so deep-linking is a no-op and the persisted
// selection (KaleidoscopeStateProvider) drives the initial preset. The web build
// (deep-link.web.ts) reads and writes window.location. Build-time split (Metro
// resolves .web.ts on web), per the house rule against runtime Platform.OS
// branches.

import type { DeepLinkParams, ReadDeepLink, WriteDeepLink } from './deep-link.types';

export const readDeepLink: ReadDeepLink = (): DeepLinkParams => ({});

export const writeDeepLink: WriteDeepLink = () => {};
