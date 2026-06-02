#!/usr/bin/env bun
// Copy the raw image assets into the published dist, preserving the per-item
// folder layout the exports map (`./images/<name>.webp`) points at. The library
// build (tsconfig.build.json, rootDir '.') emits the .js/.d.ts for each image's
// loader pair under dist/images/<name>/; the .webp itself is not a TS input, so
// it is copied here, mirroring how the old build copied src/backgrounds/*.webp
// into dist/backgrounds/.

import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const IMAGES_DIR = join(REPO_ROOT, 'images');
const DIST_IMAGES_DIR = join(REPO_ROOT, 'dist', 'images');

let copied = 0;
for (const name of readdirSync(IMAGES_DIR)) {
  const itemDir = join(IMAGES_DIR, name);
  if (!statSync(itemDir).isDirectory()) continue;
  for (const file of readdirSync(itemDir)) {
    if (!file.endsWith('.webp')) continue;
    const destDir = join(DIST_IMAGES_DIR, name);
    mkdirSync(destDir, { recursive: true });
    cpSync(join(itemDir, file), join(destDir, file));
    copied += 1;
  }
}

console.log(`copy:assets  copied ${copied} image asset(s) into dist/images/`);
