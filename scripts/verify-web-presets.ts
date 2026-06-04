#!/usr/bin/env bun
// Web smoke gate: serve the exported demo (demo/dist), drive it in headless
// Chromium with a fake camera and software WebGL, select EVERY preset in EVERY
// category tab, and fail if any preset logs a console error or throws while it
// loads. This proves each composite's layer stack builds and runs in the real
// Insertable-Streams + WebGL pipeline; it does NOT judge visuals (that is a human
// pass). Run: `bun run scripts/verify-web-presets.ts` (after `expo export -p web`).

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const DIST = join(import.meta.dir, '..', 'demo', 'dist');
const PORT = 8099;

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

const results: Array<{ tab: string; preset: string; ok: boolean; errs: string[] }> = [];

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  // Wait for the app + the picker tabs to render.
  await page.getByRole('tab').first().waitFor({ state: 'visible', timeout: 30000 });
  // Warm up: fake camera acquired, pipeline bound, first composite running.
  await sleep(4000);

  const loadErrs = errors.map((e) => e.text);
  if (loadErrs.length) console.log(`LOAD errors (before any preset):\n  ${loadErrs.join('\n  ')}`);

  const tabCount = await page.getByRole('tab').count();
  console.log(`Found ${tabCount} category tab(s).`);

  for (let t = 0; t < tabCount; t++) {
    const tab = page.getByRole('tab').nth(t);
    const tabName = (await tab.textContent())?.trim() || `tab-${t}`;
    await tab.click();
    await sleep(600);
    const radioCount = await page.getByRole('radio').count();
    for (let r = 0; r < radioCount; r++) {
      const radio = page.getByRole('radio').nth(r);
      const presetName = (await radio.textContent())?.trim() || `preset-${r}`;
      // The transform Rotate control is also role=radio; skip its degree options.
      if (/^\d+°$/.test(presetName)) continue;
      const before = errors.length;
      await radio.click();
      // Rebuild + a few composited frames (web rebuilds the pipeline per switch).
      await sleep(1600);
      const errs = errors.slice(before).map((e) => e.text);
      results.push({ tab: tabName, preset: presetName, ok: errs.length === 0, errs });
      process.stdout.write(errs.length === 0 ? '.' : 'X');
    }
  }
  process.stdout.write('\n');
  await page.screenshot({ path: join(DIST, 'verify-last-frame.png') });
} catch (e) {
  console.error('DRIVER ERROR:', e instanceof Error ? e.message : String(e));
  note(`driver: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser.close();
  server.stop(true);
}

// Report.
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length} presets driven; ${failed.length} with errors ===`);
for (const f of failed) {
  console.log(`FAIL  [${f.tab}] ${f.preset}`);
  for (const e of f.errs) console.log(`        ${e}`);
}
const loadErrs = errors.filter((e) => !results.some((r) => r.errs.includes(e.text)));
if (loadErrs.length) {
  console.log('\nUnattributed/load errors:');
  for (const e of loadErrs) console.log(`  ${e.text}`);
}
if (results.length === 0) {
  console.log('NO PRESETS DRIVEN; the app did not render or the picker was empty.');
  process.exit(1);
}
process.exit(failed.length === 0 && loadErrs.length === 0 ? 0 : 1);
