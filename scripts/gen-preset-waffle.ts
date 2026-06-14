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
// Absolute raw base so the thumbnails also render on npm (relative paths do not).
const RAW = 'https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main';
const START = '<!-- PRESET-WAFFLE:START -->';
const END = '<!-- PRESET-WAFFLE:END -->';
const TILE = 58; // px; ~30% smaller than before, compact bar-graph rows

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
  // One compact row per category (group+category keyed, so book order keeps
  // families together and a shared category name like "Ocean" stays distinct).
  const rows = new Map<string, { label: string; items: Preset[] }>();
  for (const p of presets) {
    const key = `${p.group}/${p.category}`;
    let row = rows.get(key);
    if (!row) {
      row = { label: p.category, items: [] };
      rows.set(key, row);
    }
    row.items.push(p);
  }

  const trs: string[] = [];
  for (const { label, items } of rows.values()) {
    const tiles = items
      .map((p) => {
        const thumb = thumbFor(p.id);
        const img = thumb
          ? `<img src="${RAW}/${thumb}" alt="${p.name}" title="${p.name}" width="${TILE}" />`
          : `<code>${p.name}</code>`;
        return `<a href="${DEMO}/?preset=${p.id}" title="${p.name}">${img}</a>`;
      })
      .join(' ');
    trs.push(
      `  <tr><td align="right" valign="middle"><sub><b>${label}</b></sub></td><td valign="middle">${tiles}</td></tr>`,
    );
  }

  const total = presets.length;
  const families = [...new Set(presets.map((p) => p.group))];
  const summary = `<sub>${total} presets across ${families.length} families (${families.join(
    ', ',
  )}); click any to open it live, or <a href="#make-your-own-presets">make your own</a> in a few lines.</sub>`;

  return `<table cellspacing="0" cellpadding="2">\n${trs.join('\n')}\n</table>\n\n${summary}`;
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
