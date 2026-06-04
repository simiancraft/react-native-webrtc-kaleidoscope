#!/usr/bin/env bun
// Web smoke gate: serve the exported demo (demo/dist), drive it in headless
// Chromium with a fake camera and software WebGL, select EVERY preset in EVERY
// family AND category, and fail if any preset logs a console error or throws
// while it loads. This proves each composite's layer stack builds and runs in
// the real Insertable-Streams + WebGL pipeline; it does NOT judge visuals or
// orientation (that is a human pass).
//
// The picker is THREE levels (test-id grammar in src/lib/test-id.ts):
//   family tab    accessibilityRole="tab",      testID  kld.family.<slug>
//   category item accessibilityRole="menuitem", testID  kld.category.<fam>.<cat>
//   preset tile                                 testID  kld.preset.<id>
// Selecting a family reveals its categories; selecting a category mounts that
// category's preset tiles. An earlier version of this gate iterated only the
// top-level tabs and the presets in each tab's DEFAULT category, so it missed
// every preset behind the second-level category menu (drove 8 of 30). This
// version walks the full family -> category -> preset tree, dedupes by preset
// id, and ASSERTS coverage against EXPECTED_PRESET_IDS below: if any expected
// preset was never reached the gate FAILS and lists the missing ids, so an
// undercount can no longer pass silently.
//
// Run: `bun run scripts/verify-web-presets.ts` (after `expo export -p web`).

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Locator } from 'playwright';

// The authoritative expected preset set: the keys of demo/kaleidoscope.preset-book.ts
// (Object.keys(presets)), with family/category from each preset's `taxonomy`
// (inline entries) or the imported composite's taxonomy (catalog/composites/<n>).
// Keep this in sync with the book; the coverage assertion below exists precisely
// to catch the picker rendering FEWER tiles than the book declares. If the book
// gains or loses a preset, update this table and the count moves with it.
const EXPECTED: ReadonlyArray<{ id: string; family: string; category: string }> = [
  { id: 'blur-low', family: 'Effects', category: 'Blur' },
  { id: 'blur-medium', family: 'Effects', category: 'Blur' },
  { id: 'blur-high', family: 'Effects', category: 'Blur' },
  { id: 'wizard-tower', family: 'Worlds', category: 'Wizard Tower' },
  { id: 'wizard-tower-night', family: 'Worlds', category: 'Wizard Tower' },
  { id: 'observation-deck', family: 'Worlds', category: 'Spaceship' },
  { id: 'fairy-cave', family: 'Worlds', category: 'Fairy Cave' },
  { id: 'fairy-grotto', family: 'Worlds', category: 'Fairy Cave' },
  { id: 'fairy-hollow', family: 'Worlds', category: 'Fairy Cave' },
  { id: 'underwater', family: 'Worlds', category: 'Ocean' },
  { id: 'corporate-blobs', family: 'Worlds', category: 'Corporate' },
  { id: 'simiancraft-light', family: 'Backgrounds', category: 'Simiancraft' },
  { id: 'simiancraft-dark', family: 'Backgrounds', category: 'Simiancraft' },
  { id: 'office-dark', family: 'Backgrounds', category: 'Office' },
  { id: 'office-light', family: 'Backgrounds', category: 'Office' },
  { id: 'landscape-light', family: 'Backgrounds', category: 'Nature' },
  { id: 'landscape-dark', family: 'Backgrounds', category: 'Nature' },
  { id: 'home-light', family: 'Backgrounds', category: 'Home' },
  { id: 'home-dark', family: 'Backgrounds', category: 'Home' },
  { id: 'sci-fi-light', family: 'Backgrounds', category: 'Sci-Fi' },
  { id: 'oceanscape-dark', family: 'Backgrounds', category: 'Ocean' },
  { id: 'debug-resolutions', family: 'Backgrounds', category: 'Debug' },
  { id: 'wolf-cave', family: 'Backgrounds', category: 'User' },
  { id: 'clouds', family: 'Shaders', category: 'Sky' },
  { id: 'plasma-ocean', family: 'Shaders', category: 'Plasma' },
  { id: 'plasma-sunset', family: 'Shaders', category: 'Plasma' },
  { id: 'plasma-mint', family: 'Shaders', category: 'Plasma' },
  { id: 'plasma-fast', family: 'Shaders', category: 'Plasma' },
  { id: 'nebula', family: 'Shaders', category: 'Nebula' },
  { id: 'simianlights', family: 'Shaders', category: 'Simianlights' },
];
const EXPECTED_IDS = new Set(EXPECTED.map((e) => e.id));
const FAM_CAT = new Map(EXPECTED.map((e) => [e.id, `${e.family}/${e.category}`] as const));

const DIST = join(import.meta.dir, '..', 'demo', 'dist');
const PORT = 8099;
const PRESET_PREFIX = 'kld.preset.';

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`No demo build at ${DIST}. Run: (cd demo && bunx expo export -p web)`);
  process.exit(2);
}

// Static server for the exported SPA (unknown paths fall back to index.html).
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const candidate = join(DIST, path === '/' ? 'index.html' : path);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return new Response(Bun.file(candidate));
    }
    return new Response(Bun.file(join(DIST, 'index.html')));
  },
});

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-blink-features=MediaStreamInsertableStreams',
  ],
});
const context = await browser.newContext({ permissions: ['camera'] });
const page = await context.newPage();

type Err = { at: number; text: string };
const errors: Err[] = [];
const note = (text: string) => errors.push({ at: Date.now(), text });
// Benign noise to ignore: favicon, sourcemap, font preload, React DevTools nag.
// Teardown-timing noise: switching presets fast disposes the prior pipeline, so
// an in-flight VideoFrame can GC before close(). Not a load failure (video keeps
// rendering); tracked separately as a frame-close-on-dispose follow-up.
const BENIGN =
  /favicon|sourcemap|source map|Download the React DevTools|preloaded using link preload|net::ERR_|VideoFrame was garbage collected/i;
page.on('console', (m) => {
  if (m.type() === 'error' && !BENIGN.test(m.text())) note(`console: ${m.text()}`);
});
page.on('pageerror', (e) => {
  if (!BENIGN.test(e.message)) note(`pageerror: ${e.message}`);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Result = { id: string; famCat: string; ok: boolean; errs: string[] };
const results: Result[] = [];
const driven = new Set<string>();

/** The preset id encoded in a tile's testID (`kld.preset.<id>` -> `<id>`). */
async function presetIdOf(tile: Locator): Promise<string | null> {
  // RN Web renders testID as the DOM `data-testid` attribute.
  const tid = await tile.getAttribute('data-testid');
  if (!tid?.startsWith(PRESET_PREFIX)) return null;
  return tid.slice(PRESET_PREFIX.length);
}

/** Drive every preset tile currently mounted in the grid; record + dedupe. */
async function driveMountedTiles() {
  const tiles = page.locator(`[data-testid^="${PRESET_PREFIX}"]`);
  const count = await tiles.count();
  for (let i = 0; i < count; i++) {
    const tile = tiles.nth(i);
    const id = await presetIdOf(tile);
    if (!id || driven.has(id)) continue;
    driven.add(id);
    const before = errors.length;
    await tile.click();
    // Rebuild + a few composited frames (web rebuilds the pipeline per switch).
    await sleep(1600);
    const errs = errors.slice(before).map((e) => e.text);
    results.push({ id, famCat: FAM_CAT.get(id) ?? '(unexpected)', ok: errs.length === 0, errs });
    process.stdout.write(errs.length === 0 ? '.' : 'X');
  }
}

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  // Wait for the app + the picker family tabs to render.
  await page.locator('[data-testid^="kld.family."]').first().waitFor({
    state: 'visible',
    timeout: 30000,
  });
  // Warm up: fake camera acquired, pipeline bound, first composite running.
  await sleep(4000);

  const loadErrs = errors.map((e) => e.text);
  if (loadErrs.length) console.log(`LOAD errors (before any preset):\n  ${loadErrs.join('\n  ')}`);

  // Snapshot the family-tab testIDs up front (clicking a tab re-renders, but the
  // tab set itself is stable across the run).
  const familyIds: string[] = await page
    .locator('[data-testid^="kld.family."]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? '').filter(Boolean));
  console.log(`Found ${familyIds.length} family tab(s): ${familyIds.join(', ')}`);

  for (const familyId of familyIds) {
    await page.locator(`[data-testid="${familyId}"]`).click();
    await sleep(600);

    // Categories that mounted under this family (may be empty for a flat family).
    const categoryIds: string[] = await page
      .locator('[data-testid^="kld.category."]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? '').filter(Boolean));

    if (categoryIds.length === 0) {
      // Flat family: tiles are already mounted.
      await driveMountedTiles();
      continue;
    }
    for (const categoryId of categoryIds) {
      await page.locator(`[data-testid="${categoryId}"]`).click();
      await sleep(500);
      await driveMountedTiles();
    }
  }
  process.stdout.write('\n');

  // Transforms + mask: NOT book presets (no kld.preset.* tile). Drive each verb
  // once to prove the geometry + mask channels build without a GL/console error.
  // Rotate options are accessibilityRole="radio" (testID kld.transform.rotate-<deg>);
  // exercise one non-zero rotation rather than every degree.
  const verbErrsBefore = errors.length;
  const transforms = ['kld.transform.flip-x', 'kld.transform.flip-y', 'kld.transform.rotate-90'];
  for (const tid of transforms) {
    const el = page.locator(`[data-testid="${tid}"]`).first();
    if (await el.count()) {
      await el.click();
      await sleep(800);
    }
  }
  // Mask sliders (kld.mask.*) are drag controls; a programmatic nudge is awkward
  // and the absolute mask() verb already fires on mount. We assert only that the
  // transform clicks above produced no GL/console error.
  const verbErrs = errors.slice(verbErrsBefore).map((e) => e.text);
  results.push({
    id: '(transforms: flip-x, flip-y, rotate-90)',
    famCat: 'verbs/transform',
    ok: verbErrs.length === 0,
    errs: verbErrs,
  });

  await page.screenshot({ path: join(DIST, 'verify-last-frame.png') });
} catch (e) {
  console.error('DRIVER ERROR:', e instanceof Error ? e.message : String(e));
  note(`driver: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser.close();
  server.stop(true);
}

// ---- Report ----------------------------------------------------------------
const presetResults = results.filter((r) => r.id.startsWith('('));
const tileResults = results.filter((r) => !r.id.startsWith('('));
const failed = results.filter((r) => !r.ok);

// Coverage: every EXPECTED id must have been driven; flag extras too.
const missing = [...EXPECTED_IDS].filter((id) => !driven.has(id)).sort();
const unexpected = [...driven].filter((id) => !EXPECTED_IDS.has(id)).sort();

console.log('\nid                                  family/category        GL-clean  renders');
console.log('-------------------------------------------------------------------------------');
const row = (id: string, fc: string, ok: boolean) => {
  // "renders" == a tile was clicked and the pipeline rebuilt without throwing;
  // this gate proves no GL/console error, NOT visual correctness.
  const renders = driven.has(id) || id.startsWith('(');
  console.log(
    `${id.padEnd(35)} ${fc.padEnd(22)} ${(ok ? 'yes' : 'NO').padEnd(9)} ${renders ? 'yes' : 'NO'}`,
  );
};
for (const r of [...tileResults].sort(
  (a, b) => a.famCat.localeCompare(b.famCat) || a.id.localeCompare(b.id),
)) {
  row(r.id, r.famCat, r.ok);
}
for (const r of presetResults) row(r.id, r.famCat, r.ok);

console.log(
  `\n=== expected ${EXPECTED_IDS.size} presets; driven ${driven.size}; ${failed.length} with errors ===`,
);

for (const f of failed) {
  console.log(`FAIL  [${f.famCat}] ${f.id}`);
  for (const e of f.errs) console.log(`        ${e}`);
}

let coverageOk = true;
if (missing.length) {
  coverageOk = false;
  console.log(`\nUNDERCOUNT: ${missing.length} expected preset(s) never reached:`);
  for (const id of missing) console.log(`  MISSING  ${id}  (${FAM_CAT.get(id)})`);
}
if (unexpected.length) {
  console.log(`\nNote: ${unexpected.length} driven preset(s) not in EXPECTED (book drifted?):`);
  for (const id of unexpected) console.log(`  EXTRA    ${id}`);
}

const loadErrs = errors.filter((e) => !results.some((r) => r.errs.includes(e.text)));
if (loadErrs.length) {
  console.log('\nUnattributed/load errors:');
  for (const e of loadErrs) console.log(`  ${e.text}`);
}

if (driven.size === 0) {
  console.log('NO PRESETS DRIVEN; the app did not render or the picker was empty.');
  process.exit(1);
}

const pass = failed.length === 0 && loadErrs.length === 0 && coverageOk;
console.log(
  pass
    ? `\nPASS: all ${driven.size}/${EXPECTED_IDS.size} presets render GL-clean (renders + no-GL-error + full coverage; NOT visual/orientation).`
    : '\nFAIL: see above.',
);
process.exit(pass ? 0 : 1);
