// Loads a preset book as DATA by executing it under Bun with three shims
// (issue #65). The book is real TypeScript that imports React control
// components, expo-asset, and bundled images; none of those matter to a
// thumbnail, so each is replaced with the smallest stand-in that keeps the
// module graph executable:
//
//   - `expo-asset`: `Asset.fromModule(m).uri` returns the module value itself,
//     which (via the asset shim below) is the file's absolute path.
//   - control components (`*.form.*`, `*.controls.*`): a Proxy that satisfies
//     any named import without pulling React in; presets reference these as
//     values but thumbnails never render them.
//   - bundled images (`.webp` / `.png` / `.jpg`): the file's absolute path as
//     the default export, so an image layer's `source` resolves to something
//     the CLI can read and embed.
//
// Executing (vs static parsing, which the prebuild plugin does for asset
// collection) is what yields exact per-preset layer stacks and uniform values
// with no fragile object-literal parsing. This is Bun-only by design; the
// thumbnail maker is an opt-in dev command, not runtime code.

import path from 'node:path';
import { plugin } from 'bun';

/** One layer as authored in a book (the subset thumbnails care about). */
type LoadedLayer = {
  readonly id?: string;
  readonly shader: string;
  readonly target?: string;
  readonly blend?: string;
  readonly source?: string;
  readonly uniforms?: Record<string, number | readonly number[]>;
};

/** One preset as authored in a book. */
export type LoadedPreset = {
  readonly name: string;
  readonly taxonomy: readonly string[];
  readonly thumbnail?: string | number;
  readonly layers: readonly LoadedLayer[];
};

plugin({
  name: 'kaleidoscope-thumbnails-book-shims',
  setup(build) {
    // Path-based onLoad (not onResolve, which Bun's runtime plugins do not
    // reliably fire): any file inside the expo-asset package becomes the
    // shim, so its entry never executes and never drags React Native's
    // Flow-typed asset registry in.
    build.onLoad({ filter: /node_modules\/expo-asset\/.*\.[cm]?js$/ }, () => ({
      contents: [
        'function unwrap(m) {',
        '  if (typeof m === "string") return m;',
        '  try { if (m && typeof m.default === "string") return m.default; } catch {}',
        '  try { if (m && typeof m.uri === "string") return m.uri; } catch {}',
        '  try { return String(m); } catch { return ""; }',
        '}',
        'export const Asset = { fromModule: (m) => ({ uri: unwrap(m) }) };',
      ].join('\n'),
      loader: 'js',
    }));
    // Control components are imported by NAME, and ESM named imports need the
    // name to exist; the name is convention-derived from the filename
    // (`clouds.controls.js` -> CloudsControls, `plasma.form.tsx` -> PlasmaForm),
    // so the stub synthesizes exactly that export.
    build.onLoad({ filter: /\.(form|controls)\.(tsx|jsx|ts|js)$/ }, (args) => {
      const base = path.basename(args.path);
      const stem = base.split('.')[0] ?? 'stub';
      const kind = base.includes('.controls.') ? 'Controls' : 'Form';
      const pascal = stem
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
      const name = `${pascal}${kind}`;
      return {
        contents: `export const ${name} = () => null;\nexport default ${name};`,
        loader: 'js',
      };
    });
    // Bun materializes plugin modules as ESM namespaces even when authored as
    // CJS, so the path rides the default export; `import x from './x.webp'`
    // unwraps it natively and the Asset shim's unwrap() handles the
    // `require('./x.webp')` namespace form.
    build.onLoad({ filter: /\.(webp|png|jpe?g|gif)$/ }, (args) => ({
      contents: `export default ${JSON.stringify(args.path)};`,
      loader: 'js',
    }));
  },
});

/**
 * Import the book and return its preset map. Accepts the conventional
 * `export const presets` (the demo's shape) or a default export.
 */
export async function loadPresetBook(bookPath: string): Promise<Record<string, LoadedPreset>> {
  const abs = path.resolve(bookPath);
  const mod = (await import(abs)) as { presets?: unknown; default?: unknown };
  const book = mod.presets ?? mod.default;
  if (!book || typeof book !== 'object') {
    throw new Error(
      `${bookPath} did not export a preset book (expected \`export const presets = {...}\` or a default export).`,
    );
  }
  return book as Record<string, LoadedPreset>;
}
