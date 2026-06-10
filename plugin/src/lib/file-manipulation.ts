import fs from 'node:fs';
import path from 'node:path';
import { LOG_TAG } from './constants';

// Rudimentary, domain-agnostic filesystem tools shared by both platforms' asset
// copy. These know nothing about presets, layers, or Xcode; they are the "safe"
// (non-throwing) file primitives the platform modules build on.

/** Read a UTF-8 text file, returning null on ANY error (missing or unreadable). */
export function readTextOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * The minimal shape `copyRefs` needs: a bundle `id`, a resolved on-disk
 * `srcPath` (or null when it couldn't be resolved), and an optional `specifier`
 * used only to make the skip-warning legible. The preset-book's `ImageRef` /
 * `ThumbRef` both satisfy this structurally, so this stays decoupled from that
 * domain.
 */
export type CopyRef = {
  readonly id: string;
  readonly srcPath: string | null;
  readonly specifier?: string;
};

/**
 * Copy each resolvable ref into `destDir` as `<id>.webp`, returning the ids
 * copied. `mkdir`s the destination, warns (never throws) on an unresolvable ref,
 * and skips it. The single mover both platforms call; the platform difference (
 * Android merges into `assets/`, iOS copies into the app target and registers in
 * the pbxproj) lives in the platform asset modules, not here.
 */
export function copyRefs(refs: ReadonlyArray<CopyRef>, destDir: string): string[] {
  if (refs.length === 0) return [];
  fs.mkdirSync(destDir, { recursive: true });
  const copied: string[] = [];
  for (const ref of refs) {
    if (!ref.srcPath) {
      const spec = ref.specifier ? ` (${ref.specifier})` : '';
      console.warn(
        `${LOG_TAG} Could not resolve image source for '${ref.id}'${spec}; skipping. Asset references must be statically resolvable.`,
      );
      continue;
    }
    fs.copyFileSync(ref.srcPath, path.join(destDir, `${ref.id}.webp`));
    copied.push(ref.id);
  }
  return copied;
}
