#!/usr/bin/env bun
/**
 * Generate the README "preset waffle": a dense, thumbnail-per-preset gallery
 * grouped by taxonomy, every tile a deep link into the live demo.
 *
 * Source of truth is the demo preset book (`demo/kaleidoscope.preset-book.ts`)
 * and the thumbnails it emits (`demo/assets/thumbnails/<id>.thumb.webp`, written
 * by `bun run thumbs`). The block is spliced into README.md between the markers
 *   <!-- PRESET-WAFFLE:START --> ... <!-- PRESET-WAFFLE:END -->
 *
 * Run after adding or renaming a preset (then regenerate thumbnails first):
 *   bun run thumbs && bun run gen:waffle
 * Pass --check to fail (non-zero) when the committed block is stale (CI/gate).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPresetBook } from '../tools/thumbnails/book-loader';

const ROOT = resolve(import.meta.dir, '..');
const BOOK = resolve(ROOT, 'demo/kaleidoscope.preset-book.ts');
const README = resolve(ROOT, 'README.md');
const THUMB_DIR = 'demo/assets/thumbnails';
const DEMO = 'https://simiancraft.github.io/react-native-webrtc-kaleidoscope';
const START = '<!-- PRESET-WAFFLE:START -->';
const END = '<!-- PRESET-WAFFLE:END -->';
const TILE = 84; // px; small enough to be a meter, large enough to read

type Preset = { id: string; name: string; group: string; category: string };

/** Execute the book and read each preset's canonical id, name, and taxonomy. */
async function parseBook(): Promise<Preset[]> {
  const book = await loadPresetBook(BOOK);
  return Object.entries(book).map(([id, p]) => ({
    id,
    name: p.name,
    group: p.taxonomy[0] ?? 'Other',
    category: p.taxonomy[1] ?? p.taxonomy[0] ?? 'Other',
  }));
}

/**
 * Resolve a preset's thumbnail: demo-book presets emit one under
 * `demo/assets/thumbnails/`; packaged Worlds composites carry theirs in
 * `catalog/composites/<id>/`. Returns a repo-relative path, or null.
 */
function thumbFor(id: string): string | null {
  const demo = `${THUMB_DIR}/${id}.thumb.webp`;
  if (existsSync(resolve(ROOT, demo))) return demo;
  const composite = `catalog/composites/${id}/${id}.thumb.webp`;
  if (existsSync(resolve(ROOT, composite))) return composite;
  return null;
}

function render(presets: Preset[]): string {
  const groups = new Map<string, Map<string, Preset[]>>();
  for (const p of presets) {
    let cats = groups.get(p.group);
    if (!cats) {
      cats = new Map();
      groups.set(p.group, cats);
    }
    let items = cats.get(p.category);
    if (!items) {
      items = [];
      cats.set(p.category, items);
    }
    items.push(p);
  }

  const lines: string[] = [];
  for (const [group, cats] of groups) {
    lines.push(`<sub><b>${group}</b></sub>`);
    lines.push('');
    for (const [category, items] of cats) {
      const tiles = items
        .map((p) => {
          const thumb = thumbFor(p.id);
          const img = thumb
            ? `<img src="./${thumb}" alt="${p.name}" title="${p.name}" width="${TILE}" />`
            : `<code>${p.name}</code>`;
          return `<a href="${DEMO}/?preset=${p.id}" title="${p.name}">${img}</a>`;
        })
        .join(' ');
      lines.push(`<sub>${category}</sub><br />`);
      lines.push(tiles);
      lines.push('');
    }
  }

  const total = presets.length;
  const groupNames = [...groups.keys()];
  lines.push(
    `<sub>${total} presets ship in the demo book across ${groupNames.length} families (${groupNames.join(
      ', ',
    )}); click any tile to open it live. Bring your own with a few lines; see <a href="#make-your-own-presets">Make your own presets</a>.</sub>`,
  );
  return lines.join('\n');
}

const presets = await parseBook();
const block = `${START}\n\n${render(presets)}\n\n${END}`;

if (process.argv.includes('--print')) {
  console.log(`parsed ${presets.length} presets`);
  console.log(block);
  process.exit(0);
}

const readme = readFileSync(README, 'utf8');
const re = new RegExp(`${START}[\\s\\S]*?${END}`);
if (!re.test(readme)) {
  console.error(`README is missing the waffle markers (${START} / ${END}).`);
  process.exit(1);
}
const next = readme.replace(re, block);

if (process.argv.includes('--check')) {
  if (next !== readme) {
    console.error('Preset waffle is stale. Run: bun run thumbs && bun run gen:waffle');
    process.exit(1);
  }
  console.log('Preset waffle is up to date.');
  process.exit(0);
}

writeFileSync(README, next);
console.log(`Wrote preset waffle: ${presets.length} presets.`);
