// Drift guard: every styleable component exported from src/components/picker/index.tsx and the
// control primitives (src/components/ui/index.ts) must be registered with
// cssInterop in src/nativewind.ts, or it silently ignores `className` in
// production while the rest honor it. Scope is the PRIMITIVES barrel, not the
// whole ./tuner barrel, so providers and shells (ControlForm, the Tuner,
// ControlSection, the theme provider) are not wrongly demanded into the list.
// Nothing else enforces this (it compiles, typechecks, and registry-parity
// covers native bridges, not this), so pin it by text.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const uiIndex = read('../src/components/picker/index.tsx');
const controlsPrimitives = read('../src/components/ui/index.ts');
const nativewind = read('../src/nativewind.ts');

// Value (non-type) named exports from a barrel: both `export { ... } from`
// re-export blocks (skipping `export type { ... }` and inline `type X` members)
// AND inline `export function`/`export const` declarations (the picker feature's
// index.tsx is its own chassis, so it inline-exports KaleidoscopePicker rather
// than re-exporting it).
const valueExports = (src: string): string[] => {
  const names: string[] = [];
  for (const m of src.matchAll(/export\s+\{([^}]*)\}\s+from/g)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const item = raw.trim();
      if (!item || item.startsWith('type ')) continue;
      names.push((item.split(/\s+as\s+/)[0] ?? '').trim());
    }
  }
  for (const m of src.matchAll(/export\s+(?:function|const)\s+([A-Za-z0-9_]+)/g)) {
    const name = (m[1] ?? '').trim();
    if (name) names.push(name);
  }
  return names;
};

const cssInteropTargets = (src: string): string[] =>
  [...src.matchAll(/cssInterop\(\s*(\w+)/g)].map((m) => m[1] ?? '');

// Styleable = a PascalCase component name (UpperFirst, alphanumeric). This
// excludes hooks (use*, lowercase) and SCREAMING_CASE constants/contexts, so a
// future non-component value export from ./ui is not wrongly demanded into the
// cssInterop list. Constraint the extractor assumes: the ./ui barrel re-exports
// with `export { X } from './...'` (a local re-export without `from` would be
// invisible here); if that changes, revisit valueExports.
const isComponentName = (name: string): boolean => /^[A-Z][a-zA-Z0-9]*$/.test(name);

describe('picker nativewind interop parity', () => {
  test('every styleable ./ui + control-primitive export is cssInterop-registered in ./nativewind', () => {
    const styleable = [...valueExports(uiIndex), ...valueExports(controlsPrimitives)]
      .filter(isComponentName)
      .sort();
    const registered = cssInteropTargets(nativewind).sort();
    expect(registered).toEqual(styleable);
    expect(registered.length).toBeGreaterThan(0);
  });
});
