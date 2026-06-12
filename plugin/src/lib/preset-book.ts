// Static analysis of the consumer's preset book (prebuild-only).
//
// The book is read as TEXT, never executed: a layer's `source` is per-platform
// (a URL on web, an image id on native), so it is not a static specifier;
// instead we read the book's imports and its `image` layers to learn which asset
// each preset references. The runtime never does this; it receives the book as a
// real object. So this lives in the plugin, not the runtime.
//
// Static-analyzability is the consumer's contract (documented in the README):
// each `image` layer is `{ id, shader: 'image', source: <ref> }`, where <ref> is
// a `require('./x.webp')` literal, a single named import from an
// `.../images/<category>/<leaf>` specifier, or a `const X = ...require('./x.webp')...`
// binding. A binding's initializer may span lines (a consumer's formatter wraps
// the idiomatic `Asset.fromModule(require(...)).uri` at narrow print widths), so
// the parse reads statements, not lines. Anything that can't be parsed or
// resolved warns (never throws), matching the plugin's non-fatal contract; an
// `image` layer dropped silently at prebuild is a bug, not a policy.

import fs from 'node:fs';
import path from 'node:path';
import { LOG_TAG } from './constants';
import { readTextOrNull } from './file-manipulation';

/** The file a consumer declares at their project root. */
export const PRESET_BOOK_FILENAME = 'kaleidoscope.preset-book.ts';

/** An image a preset references: its bundle id, source specifier, on-disk path. */
export type ImageRef = {
  readonly id: string;
  readonly specifier: string;
  readonly srcPath: string | null;
};

/** A packaged composite's thumbnail: its bundle id and on-disk path. */
export type ThumbRef = {
  readonly id: string;
  readonly srcPath: string;
};

/**
 * Local binding -> import specifier, for single named imports (`{ X }` and
 * `{ X as Y }`; the LOCAL name is what a layer's `source` references) plus
 * `const X = ...require('spec')...` bindings (the idiomatic Expo
 * `Asset.fromModule(require('./x.webp')).uri`). Imports win on a name clash.
 */
function parseImports(source: string): Record<string, string> {
  const imports: Record<string, string> = {};
  const re =
    /import\s*\{\s*([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?\s*\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(re)) {
    const local = m[2] ?? m[1];
    const specifier = m[3];
    if (local && specifier) imports[local] = specifier;
  }
  // The initializer scan crosses newlines (formatters wrap the binding) but
  // stops at `;` and refuses to run into a following declaration, so a
  // no-semicolon style cannot misattribute a later require() to an earlier
  // binding.
  const requireBindingRe =
    /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:(?!\b(?:const|let|var)\b)[^;])*?\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of source.matchAll(requireBindingRe)) {
    const local = m[1];
    const specifier = m[2];
    if (local && specifier && !(local in imports)) imports[local] = specifier;
  }
  return imports;
}

/**
 * Derive an image id from its source specifier: the basename without extension
 * (`'./assets/wolf-cave.webp'` -> `'wolf-cave'`). The fallback id when an image
 * layer omits an explicit `id`; matches the basename==id convention the runtime
 * sends as the native `source` (native resolves `assets/images/<id>.webp`).
 */
function imageIdFromSpecifier(specifier: string): string {
  const segment = specifier.substring(specifier.lastIndexOf('/') + 1);
  return segment.replace(/\.[^.]+$/, '');
}

/**
 * Every `image` layer's id + asset specifier in a source file (the book OR an
 * imported composite). The id is the layer's `id` (the basename native resolves
 * by); the specifier resolves to the `.webp`.
 */
function parseImageRefs(source: string): Array<{ id: string; specifier: string }> {
  const imports = parseImports(source);
  const refs: Array<{ id: string; specifier: string }> = [];
  const seen = new Set<string>();
  // Each image-layer object is a flat brace group containing `shader: 'image'`.
  const layerRe = /\{([^{}]*shader\s*:\s*['"]image['"][^{}]*)\}/g;
  for (const m of source.matchAll(layerRe)) {
    const body = m[1];
    if (!body) continue;
    const layerId = body.match(/\bid\s*:\s*['"]([\w-]+)['"]/)?.[1];
    const sourceM = body.match(/source\s*:\s*(require\(\s*['"][^'"]+['"]\s*\)|[A-Za-z0-9_$]+)/);
    const expr = sourceM?.[1];
    // The warn-never-throw contract: a layer the parse cannot follow is skipped
    // LOUDLY, naming the layer, so the missing plate surfaces at prebuild
    // instead of on-device.
    if (!expr) {
      console.warn(
        `${LOG_TAG} Could not parse the 'source' of image layer '${layerId ?? '<no id>'}'; skipping its asset. An image layer's source must be a require('...') literal or an identifier bound by a single named import or a require() binding.`,
      );
      continue;
    }
    const requireLiteral = expr.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
    const specifier = requireLiteral ? requireLiteral[1] : (imports[expr] ?? null);
    if (!specifier) {
      console.warn(
        `${LOG_TAG} Could not resolve '${expr}' (the 'source' of image layer '${layerId ?? '<no id>'}') to an import or require() binding; skipping its asset.`,
      );
      continue;
    }
    const id = layerId ?? imageIdFromSpecifier(specifier);
    if (seen.has(id)) continue;
    seen.add(id);
    refs.push({ id, specifier });
  }
  return refs;
}

/**
 * The composite a specifier references: `<pkg>/composites/<name>` or any of its
 * per-composite subpaths (today `/controls`). A consumer importing ONLY a
 * composite's controls is still using that composite, so both forms count.
 */
function compositeNameFromSpecifier(specifier: string): string | null {
  return specifier.match(/(?:^|\/)composites\/([\w-]+)(?:\/controls)?$/)?.[1] ?? null;
}

/**
 * Resolve an imported-composite specifier (`<pkg>/composites/<name>`, or its
 * `/controls` subpath) to the composite's source `.ts` on disk. Returns null
 * for a non-composite specifier or an unresolvable package.
 */
function resolveCompositeSource(specifier: string, projectRoot: string): string | null {
  const name = compositeNameFromSpecifier(specifier);
  if (!name) return null;
  try {
    const pkgJson = require.resolve('react-native-webrtc-kaleidoscope/package.json', {
      paths: [projectRoot],
    });
    const ts = path.join(path.dirname(pkgJson), 'catalog', 'composites', name, `${name}.ts`);
    return fs.existsSync(ts) ? ts : null;
  } catch {
    return null;
  }
}

/** Resolve an `image` layer's `source` specifier to an on-disk WebP path. */
function resolveAssetPath(specifier: string, baseDir: string, projectRoot: string): string | null {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    const abs = path.resolve(baseDir, specifier);
    for (const candidate of [`${abs}.webp`, abs]) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }
  try {
    return require.resolve(`${specifier}.webp`, { paths: [projectRoot] });
  } catch {
    try {
      return require.resolve(specifier, { paths: [projectRoot] });
    } catch {
      return null;
    }
  }
}

// Walk a book's own source plus every imported-composite source, yielding each
// with the base dir its relative specifiers resolve against. Shared by both
// collectors so neither drifts from the other.
function walkBookSources(
  bookSource: string,
  projectRoot: string,
): Array<{ readonly source: string; readonly baseDir: string }> {
  const sources = [{ source: bookSource, baseDir: projectRoot }];
  // A composite and its `/controls` subpath resolve to the SAME source file;
  // parse it once.
  const seenPaths = new Set<string>();
  for (const specifier of Object.values(parseImports(bookSource))) {
    const compositePath = resolveCompositeSource(specifier, projectRoot);
    if (!compositePath || seenPaths.has(compositePath)) continue;
    seenPaths.add(compositePath);
    const compositeSource = readTextOrNull(compositePath);
    // Non-fatal: a composite we cannot read contributes nothing.
    if (compositeSource !== null) {
      sources.push({ source: compositeSource, baseDir: path.dirname(compositePath) });
    }
  }
  return sources;
}

/**
 * Every image a preset book needs: the image layers declared inline in the book
 * PLUS the image layers inside every packaged composite it imports.
 */
function collectImageRefs(bookSource: string, projectRoot: string): ImageRef[] {
  const refs: ImageRef[] = [];
  const seen = new Set<string>();
  for (const { source, baseDir } of walkBookSources(bookSource, projectRoot)) {
    for (const { id, specifier } of parseImageRefs(source)) {
      if (seen.has(id)) continue;
      seen.add(id);
      refs.push({ id, specifier, srcPath: resolveAssetPath(specifier, baseDir, projectRoot) });
    }
  }
  return refs;
}

/**
 * Every packaged composite's `<name>.thumb.webp`, keyed by `<name>-thumb` (the
 * suffix disambiguates from a same-named image). Mirrors collectImageRefs but for
 * the picker-tile thumbnails (a different asset family).
 */
function collectCompositeThumbRefs(bookSource: string, projectRoot: string): ThumbRef[] {
  const refs: ThumbRef[] = [];
  const seen = new Set<string>();
  for (const specifier of Object.values(parseImports(bookSource))) {
    const name = compositeNameFromSpecifier(specifier);
    if (!name || seen.has(name)) continue;
    const compositeTs = resolveCompositeSource(specifier, projectRoot);
    if (!compositeTs) continue;
    const thumbPath = path.join(path.dirname(compositeTs), `${name}.thumb.webp`);
    if (!fs.existsSync(thumbPath)) continue;
    seen.add(name);
    refs.push({ id: `${name}-thumb`, srcPath: thumbPath });
  }
  return refs;
}

/**
 * Read the consumer's preset book at the project root and collect every asset it
 * references: image-layer images plus packaged-composite thumbnails. Returns null
 * when there is no book (a consumer that declares no assets), which both
 * platforms treat as "nothing to bundle, stay quiet". The ONE place the book is
 * read from disk; the platform asset modules consume the result.
 */
export function collectReferencedAssets(
  projectRoot: string,
): { readonly images: ImageRef[]; readonly thumbs: ThumbRef[] } | null {
  const source = readTextOrNull(path.join(projectRoot, PRESET_BOOK_FILENAME));
  if (source === null) return null;
  return {
    images: collectImageRefs(source, projectRoot),
    thumbs: collectCompositeThumbRefs(source, projectRoot),
  };
}
