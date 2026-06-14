// Web build: read the deep-link params from the URL query string, and reflect the
// active selection back via history.replaceState (no navigation, so it does not
// fight expo-router). Paste a shared URL -> its params select the preset on load;
// pick a preset -> the URL canonicalizes to ?preset=<id> for re-sharing.

import type { DeepLinkParams, ReadDeepLink, WriteDeepLink } from './deep-link.types';

export const readDeepLink: ReadDeepLink = (): DeepLinkParams => {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const get = (k: string): string | undefined => q.get(k)?.trim() || undefined;
  return {
    preset: get('preset'),
    group: get('group'),
    category: get('category'),
    item: get('item'),
  };
};

export const writeDeepLink: WriteDeepLink = (params): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  // Rewrite the whole deep-link param set to the selection's readable axes.
  for (const k of ['preset', 'group', 'category', 'item']) url.searchParams.delete(k);
  if (params?.group) url.searchParams.set('group', params.group);
  if (params?.category) url.searchParams.set('category', params.category);
  if (params?.item) url.searchParams.set('item', params.item);
  window.history.replaceState(window.history.state, '', url.toString());
};
