#!/usr/bin/env bun
// Copy the raw .webp assets into the published dist, preserving the per-item
// folder layout the exports map points at. The library build
// (tsconfig.build.json, rootDir '.') emits the .js/.d.ts for each item under
// dist/<tree>/<name>/; the .webp itself is not a TS input, so it is copied here.
//   - images/<category>/*.webp -> dist/images/<category>/  (plates + their thumbs)
//   - composites/<name>/*.webp -> dist/composites/<name>/  (the scene thumbnail
//     a composite's def imports, e.g. fairy-cave.thumb.webp)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function copyTree(tree: string): number {
  const srcDir = join(REPO_ROOT, tree);
  const distDir = join(REPO_ROOT, 'dist', tree);
  if (!existsSync(srcDir)) return 0;
  let copied = 0;
  for (const name of readdirSync(srcDir)) {
    const itemDir = join(srcDir, name);
    if (!statSync(itemDir).isDirectory()) continue;
    for (const file of readdirSync(itemDir)) {
      if (!file.endsWith('.webp')) continue;
      const destDir = join(distDir, name);
      mkdirSync(destDir, { recursive: true });
      cpSync(join(itemDir, file), join(destDir, file));
      copied += 1;
    }
  }
  return copied;
}

for (const tree of ['catalog/images', 'catalog/composites']) {
  const copied = copyTree(tree);
  console.log(`copy:assets  copied ${copied} webp asset(s) into dist/${tree}/`);
}
