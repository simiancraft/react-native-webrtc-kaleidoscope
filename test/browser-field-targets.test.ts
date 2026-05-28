// Guard the package.json `browser`-field remap, which publint does not validate
// and which is otherwise only enforced transitively by the demo web build: if
// `resolve-background-uri.ts` (or any future remapped file) is moved/renamed and
// the browser key left stale, the type system and publint stay green while web
// thumbnails silently break. Pin each browser key/value to an existing source
// file (build-independent; tsgo emits dist/ from src/ 1:1).

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  browser?: Record<string, string>;
};

// ./dist/ui/x.js -> src/ui/x ; ./dist/ui/x.web.js -> src/ui/x.web
const toSourceBase = (distPath: string): string =>
  distPath.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '');

describe('browser-field remap targets', () => {
  test('every package.json browser key and value has a real source file', () => {
    const browser = pkg.browser ?? {};
    const paths = [...Object.keys(browser), ...Object.values(browser)];
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      const base = toSourceBase(p);
      const candidates = [`${base}.ts`, `${base}.tsx`];
      const found = candidates.some((c) => existsSync(new URL(`../${c}`, import.meta.url)));
      expect(
        found,
        `browser-field path "${p}" has no source counterpart (${candidates.join(' or ')})`,
      ).toBe(true);
    }
  });
});
