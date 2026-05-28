// Drift guard: every styleable component exported from src/ui/index.ts must be
// registered with cssInterop in src/nativewind.ts, or it silently ignores
// `className` in production while the rest honor it. Nothing else enforces this
// (it compiles, typechecks, and the registry-parity test covers native bridges,
// not this), so pin it by text the same way registry-parity.test.ts does.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const uiIndex = read('../src/ui/index.ts');
const nativewind = read('../src/nativewind.ts');

// Value (non-type) named exports from a barrel; skips `export type { ... }`
// blocks (the `export {` pattern won't match `export type {`) and inline
// `type X` members.
const valueExports = (src: string): string[] => {
  const names: string[] = [];
  for (const m of src.matchAll(/export\s+\{([^}]*)\}\s+from/g)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const item = raw.trim();
      if (!item || item.startsWith('type ')) continue;
      names.push((item.split(/\s+as\s+/)[0] ?? '').trim());
    }
  }
  return names;
};

const cssInteropTargets = (src: string): string[] =>
  [...src.matchAll(/cssInterop\(\s*(\w+)/g)].map((m) => m[1] ?? '');

// Hooks (use*) are not components and are correctly not cssInterop-registered.
const isHook = (name: string): boolean => /^use[A-Z]/.test(name);

describe('picker nativewind interop parity', () => {
  test('every styleable ./ui export is cssInterop-registered in ./nativewind', () => {
    const styleable = valueExports(uiIndex)
      .filter((n) => !isHook(n))
      .sort();
    const registered = cssInteropTargets(nativewind).sort();
    expect(registered).toEqual(styleable);
    expect(registered.length).toBeGreaterThan(0);
  });
});
