#!/usr/bin/env bun
// Static gate for the two thumbnail-wiring defects that shipped blank picker
// tiles on native standalone builds while rendering fine on web (so CI's
// web-only build never caught them). See AGENTS.md "Assets reach native two
// different ways". This check is deterministic and cheap; it runs in
// `bun run check` so a reintroduction fails the gate instead of a device.
//
// It enforces two rules:
//   1. A single-file book (the demo) must NOT wire a `thumbnail` as
//      `Asset.fromModule(...).uri` — that string renders on web but does not
//      resolve to the embedded asset in a native release build. Use a bare
//      `require('./x.webp')` (a Metro asset id) or an imported image module.
//   2. Every packaged composite that ships a `<name>.thumb.webp` must wire it
//      on BOTH platforms: `<name>.ts` with `thumbnail: '<name>-thumb'`, a
//      `<name>.web.ts` with `Asset.fromModule(...).uri`, and a `browser`
//      export condition. (The `clouds` bug was a composite missing all three.)

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const errors: string[] = [];

// Rule 1: the demo book's inline thumbnails.
const BOOK = 'demo/kaleidoscope.preset-book.ts';
readFileSync(join(ROOT, BOOK), 'utf8')
  .split('\n')
  .forEach((line, i) => {
    if (/\bthumbnail\s*:\s*Asset\.fromModule\s*\(/.test(line)) {
      errors.push(
        `${BOOK}:${i + 1}  thumbnail wired as Asset.fromModule(...).uri. That URL is web-only and is blank on a native standalone build; use a bare require('./x.webp') or an imported image module.`,
      );
    }
  });

// Rule 2: every composite with a thumb file is wired on both platforms.
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  exports?: Record<string, { browser?: string }>;
};
const COMPOSITES = join(ROOT, 'catalog/composites');
for (const name of readdirSync(COMPOSITES)) {
  const dir = join(COMPOSITES, name);
  if (!existsSync(join(dir, `${name}.thumb.webp`))) continue; // no thumb to wire

  const tsPath = join(dir, `${name}.ts`);
  const ts = existsSync(tsPath) ? readFileSync(tsPath, 'utf8') : '';
  if (!new RegExp(`thumbnail\\s*:\\s*['"]${name}-thumb['"]`).test(ts)) {
    errors.push(
      `catalog/composites/${name}/${name}.ts  missing native thumbnail: '${name}-thumb' (the string id the prebuild plugin bundles).`,
    );
  }

  const webPath = join(dir, `${name}.web.ts`);
  if (!existsSync(webPath)) {
    errors.push(
      `catalog/composites/${name}/${name}.web.ts  missing; web needs thumbnail: Asset.fromModule(require('./${name}.thumb.webp')).uri.`,
    );
  } else {
    const web = readFileSync(webPath, 'utf8');
    if (!/thumbnail\s*:\s*Asset\.fromModule\s*\(/.test(web) || !/\.uri/.test(web)) {
      errors.push(
        `catalog/composites/${name}/${name}.web.ts  thumbnail should be Asset.fromModule(require('./${name}.thumb.webp')).uri.`,
      );
    }
  }

  if (!pkg.exports?.[`./composites/${name}`]?.browser) {
    errors.push(
      `package.json  export "./composites/${name}" needs a "browser" condition pointing at ${name}.web.js.`,
    );
  }
}

if (errors.length > 0) {
  console.error(`Asset-wiring check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('Asset-wiring check passed.');
