// Resolve deep-link params to a preset id. The grouping mirrors the picker's
// (usePresetBookMenu): families and categories in first-appearance order, items
// in book order, so "position 0" is the same tile the menu shows. Per-level
// fallback, exactly the requested behavior: an unmatched group, category, or item
// drops to position 0 of the last level that DID match, down to a leaf. Returns
// null when no params are present (no deep-link intent), leaving the persisted
// selection in charge.

import type { KaleidoscopePresetBook } from 'react-native-webrtc-kaleidoscope';
import type { DeepLinkParams } from './deep-link.types';

/** Forgiving compare key: lowercase, spaces/underscores to hyphens, alnum + hyphen. */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

type Leaf = { readonly id: string; readonly name: string };

const matchKey = (keys: readonly string[], v: string | undefined): string | undefined =>
  v ? keys.find((k) => slug(k) === slug(v)) : undefined;

const matchLeaf = (leaves: readonly Leaf[], v: string | undefined): Leaf | undefined =>
  v
    ? leaves.find((l) => l.id === v || slug(l.id) === slug(v) || slug(l.name) === slug(v))
    : undefined;

/**
 * Derive the deep-link params for a selected preset (the inverse of resolve):
 * group = taxonomy[0], category = taxonomy[1] (if any), item = the preset name,
 * all slugged so the URL is clean and round-trips back through resolvePreset.
 */
export function presetToParams(presets: KaleidoscopePresetBook, id: string): DeepLinkParams {
  const p = presets[id];
  if (!p) return {};
  return {
    group: slug(p.taxonomy[0]),
    category: p.taxonomy[1] !== undefined ? slug(p.taxonomy[1]) : undefined,
    item: slug(p.name),
  };
}

export function resolvePreset(
  presets: KaleidoscopePresetBook,
  params: DeepLinkParams,
): string | null {
  const { preset, group, category, item } = params;
  if (!preset && !group && !category && !item) return null;

  // 1. Exact preset id wins (the canonical share form).
  if (preset && presets[preset]) return preset;

  // The leaf hint: an explicit item, else a `preset` that did not hit an id.
  const hint = item ?? preset;

  // 2. With nothing to narrow the search, a bare id/name hint matches anywhere.
  if (!group && !category && hint) {
    for (const id of Object.keys(presets)) {
      const p = presets[id];
      if (!p) continue;
      if (id === hint || slug(id) === slug(hint) || slug(p.name) === slug(hint)) return id;
    }
  }

  // 3. Hierarchical resolve with per-level fallback to position 0. Grouped here
  // the same way usePresetBookMenu does, so the ordering matches the picker.
  const families: string[] = [];
  const itemsByFamily = new Map<string, Leaf[]>();
  const catsByFamily = new Map<string, string[]>();
  const itemsByFamilyCat = new Map<string, Map<string, Leaf[]>>();
  for (const id of Object.keys(presets)) {
    const p = presets[id];
    if (!p) continue;
    const fam = p.taxonomy[0];
    const cat = p.taxonomy[1];
    const leaf: Leaf = { id, name: p.name };
    if (!itemsByFamily.has(fam)) {
      families.push(fam);
      itemsByFamily.set(fam, []);
      catsByFamily.set(fam, []);
      itemsByFamilyCat.set(fam, new Map());
    }
    itemsByFamily.get(fam)?.push(leaf);
    if (cat !== undefined) {
      const cats = catsByFamily.get(fam);
      const byCat = itemsByFamilyCat.get(fam);
      if (cats && byCat && !byCat.has(cat)) {
        cats.push(cat);
        byCat.set(cat, []);
      }
      byCat?.get(cat)?.push(leaf);
    }
  }
  if (families.length === 0) return null;

  const fam = matchKey(families, group) ?? families[0];
  const cats = catsByFamily.get(fam) ?? [];

  // Flat family (depth-1 presets, no categories): items sit under the family.
  if (cats.length === 0) {
    const leaves = itemsByFamily.get(fam) ?? [];
    return (matchLeaf(leaves, hint) ?? leaves[0])?.id ?? null;
  }

  const cat = matchKey(cats, category) ?? cats[0];
  const leaves = itemsByFamilyCat.get(fam)?.get(cat) ?? [];
  return (matchLeaf(leaves, hint) ?? leaves[0])?.id ?? null;
}
