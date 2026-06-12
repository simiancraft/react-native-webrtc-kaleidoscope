#!/usr/bin/env bun
// Thumbnail maker (issue #65): generate a standardized 320x180 WebP thumbnail
// for EVERY preset in a declared preset book, stomping existing files.
//
//   bunx kaleidoscope-thumbnails --book ./kaleidoscope.preset-book.ts --out ./assets/thumbnails
//   bun run thumbs        # this repo: demo book, repo conventions (see --repo)
//
// What it does: loads the book as data (see book-loader.ts), projects each
// preset's NON-SUBJECT layer stack (no mask, no person) into a render spec,
// and drives a headless-Chromium page (render-page.ts) that composites the
// stack — generative shaders at their exact preset uniforms over control
// defaults, image layers cover-fit, blur layers blurring the bundled
// "virtual scene" office fixture standing in for the camera — then encodes
// the smallest WebP that survives an RMSE gate against the raw render.
//
// Output: `<out>/<preset-id>.thumb.webp` per preset, plus printed `thumbnail:`
// wiring suggestions. The tool never rewrites the book. With --repo (this
// repository's convention) two preset classes are redirected:
//   - a preset whose id matches a packaged composite stomps
//     `catalog/composites/<id>/<id>.thumb.webp` (already wired by id);
//   - a single-image preset whose plate lives under `catalog/images/`
//     stomps the sibling `<leaf>.thumb.webp` (the existing image-thumb
//     convention).
//
// Requirements: Bun, and `playwright` resolvable from the working directory
// (it is a devDependency here; consumers install it themselves — this is an
// opt-in command, not runtime code). The default browser flags reach a real
// GPU through WSLg/ANGLE; pass --no-gl-flags on platforms where they fight
// the default (macOS).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type LoadedPreset, loadPresetBook } from './book-loader';
import { type PageLayerSpec, type PagePresetSpec, type PageResult, generatePage } from './render-page';

const TOOL_DIR = path.dirname(new URL(import.meta.url).pathname);
const PKG_ROOT = path.resolve(TOOL_DIR, '..', '..');

type Args = {
  book: string;
  out: string;
  fixture: string;
  repo: boolean;
  glFlags: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = {
    book: 'kaleidoscope.preset-book.ts',
    out: 'assets/thumbnails',
    fixture: path.join(TOOL_DIR, 'office-fixture.webp'),
    repo: false,
    glFlags: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--book') a.book = argv[++i] ?? a.book;
    else if (k === '--out') a.out = argv[++i] ?? a.out;
    else if (k === '--fixture') a.fixture = argv[++i] ?? a.fixture;
    else if (k === '--repo') a.repo = true;
    else if (k === '--no-gl-flags') a.glFlags = false;
    else if (k === '--help' || k === '-h') {
      console.log(
        'usage: kaleidoscope-thumbnails --book <preset-book.ts> --out <dir> [--fixture <img>] [--repo] [--no-gl-flags]',
      );
      process.exit(0);
    }
  }
  return a;
}

function toDataUrl(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${readFileSync(filePath).toString('base64')}`;
}

/** Find `catalog/images/<category>/<id>.webp` for a native image id. */
function findCatalogImage(id: string): string | null {
  const root = path.join(PKG_ROOT, 'catalog', 'images');
  if (!existsSync(root)) return null;
  for (const cat of readdirSync(root, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    const candidate = path.join(root, cat.name, `${id}.webp`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Resolve an image layer's source (path, native id, or book-relative) to a file. */
function resolveImagePath(source: string, bookDir: string): string | null {
  if (existsSync(source)) return source;
  const catalogHit = findCatalogImage(source);
  if (catalogHit) return catalogHit;
  const rel = path.resolve(bookDir, source);
  if (existsSync(rel)) return rel;
  return null;
}

/** Shader-name -> default-uniform map, read from the built control descriptors. */
async function loadShaderDefaults(): Promise<Record<string, Record<string, number | number[]>>> {
  const mod = (await import(path.join(PKG_ROOT, 'dist', 'catalog', 'shaders', 'index.js'))) as Record<
    string,
    unknown
  >;
  const defaults: Record<string, Record<string, number | number[]>> = {};
  for (const [exportName, value] of Object.entries(mod)) {
    if (!exportName.endsWith('_CONTROLS') || !Array.isArray(value)) continue;
    const shader = exportName.slice(0, -'_CONTROLS'.length).toLowerCase().replace(/_/g, '-');
    const map: Record<string, number | number[]> = {};
    for (const c of value as Array<{ name: string; default: number | readonly number[] }>) {
      map[c.name] = Array.isArray(c.default) ? [...c.default] : (c.default as number);
    }
    defaults[shader] = map;
  }
  return defaults;
}

type Job = {
  readonly id: string;
  readonly spec: PagePresetSpec;
  readonly dest: string;
  readonly extraDests: readonly string[]; // additional copies (catalog stomp + book-local)
  readonly wire: boolean; // whether to print a thumbnail: wiring suggestion
};

function buildJobs(
  book: Record<string, LoadedPreset>,
  args: Args,
  bookDir: string,
  defaults: Record<string, Record<string, number | number[]>>,
  shaderNames: ReadonlySet<string>,
): Job[] {
  const jobs: Job[] = [];
  for (const [id, preset] of Object.entries(book)) {
    const layers: PageLayerSpec[] = [];
    const imagePaths: string[] = [];
    let skip: string | null = null;

    for (const layer of preset.layers) {
      if (layer.target === 'subject' || layer.shader === 'direct') continue;
      const blend = layer.blend;
      if (layer.shader === 'image') {
        const resolved = layer.source ? resolveImagePath(layer.source, bookDir) : null;
        if (!resolved) {
          skip = `image layer '${layer.id ?? '?'}' source '${layer.source}' not found`;
          break;
        }
        imagePaths.push(resolved);
        layers.push({ kind: 'image', dataUrl: toDataUrl(resolved), blend });
      } else if (layer.shader === 'blur') {
        const sigma = Number(layer.uniforms?.sigma ?? defaults.blur?.sigma ?? 3);
        layers.push({ kind: 'blur', sigma, blend });
      } else if (shaderNames.has(layer.shader)) {
        const uniforms = { ...(defaults[layer.shader] ?? {}), ...(layer.uniforms ?? {}) };
        const plain: Record<string, number | number[]> = {};
        for (const [k, v] of Object.entries(uniforms)) plain[k] = Array.isArray(v) ? [...v] : (v as number);
        layers.push({ kind: 'shader', name: layer.shader, uniforms: plain, blend });
      } else {
        skip = `unknown layer shader '${layer.shader}'`;
        break;
      }
    }
    if (skip) {
      console.warn(`  skip ${id}: ${skip}`);
      continue;
    }
    if (layers.length === 0) {
      console.warn(`  skip ${id}: no renderable background layers`);
      continue;
    }

    // Destination: repo conventions split composites and catalog images.
    let dest = path.resolve(args.out, `${id}.thumb.webp`);
    const extraDests: string[] = [];
    let wire = true;
    if (args.repo) {
      const compositeDir = path.join(PKG_ROOT, 'catalog', 'composites', id);
      const onlyImage = layers.length === 1 && layers[0]?.kind === 'image' && imagePaths[0];
      if (existsSync(compositeDir)) {
        dest = path.join(compositeDir, `${id}.thumb.webp`);
        wire = false; // already wired by id (native) and by module (web)
      } else if (onlyImage && imagePaths[0]?.startsWith(path.join(PKG_ROOT, 'catalog', 'images'))) {
        // Stomp the catalog's image-thumb convention AND keep a book-local
        // copy: the package's exports map does not expose catalog thumbs, so
        // the book wires the local one.
        const img = imagePaths[0];
        extraDests.push(path.join(path.dirname(img), `${path.basename(img, '.webp')}.thumb.webp`));
      }
    }
    jobs.push({ id, spec: { id, layers }, dest, extraDests, wire });
  }
  return jobs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.book)) {
    console.error(`book not found: ${args.book}`);
    process.exit(2);
  }
  if (!existsSync(args.fixture)) {
    console.error(`camera fixture not found: ${args.fixture}`);
    process.exit(2);
  }

  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error(
      'playwright is required: install it as a devDependency (`bun add -d playwright && bunx playwright install chromium`).',
    );
    process.exit(2);
  }

  const book = await loadPresetBook(args.book);
  const bookDir = path.dirname(path.resolve(args.book));
  const defaults = await loadShaderDefaults();

  const generated = (await import(
    path.join(PKG_ROOT, 'dist', 'web-driver', 'shaders.generated.js')
  )) as {
    SHADER_SOURCES: Readonly<Record<string, string>>;
    COMPOSITE_BLUR_FRAG_SRC: string;
  };

  const jobs = buildJobs(book, args, bookDir, defaults, new Set(Object.keys(generated.SHADER_SOURCES)));
  console.log(`${jobs.length} preset(s) to render from ${path.relative(process.cwd(), args.book)}`);

  const html = generatePage({
    shaderSources: generated.SHADER_SOURCES,
    blurFragSrc: generated.COMPOSITE_BLUR_FRAG_SRC,
    fixtureDataUrl: toDataUrl(args.fixture),
  });
  const pagePath = path.join(tmpdir(), `kaleidoscope-thumbs-${process.pid}.html`);
  writeFileSync(pagePath, html);

  const browser = await chromium.launch({
    args: args.glFlags ? ['--use-gl=angle', '--use-angle=gl'] : [],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
  await page.goto(`file://${pagePath}`);

  const wires: string[] = [];
  let failures = 0;
  for (const job of jobs) {
    try {
      const result = (await page.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: page-scope function injected by render-page
        (spec) => (window as any).renderPreset(spec),
        job.spec,
      )) as PageResult;
      const b64 = result.dataUrl.slice('data:image/webp;base64,'.length);
      for (const dest of [job.dest, ...job.extraDests]) {
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, Buffer.from(b64, 'base64'));
      }
      const kb = (Buffer.byteLength(b64, 'base64') / 1024).toFixed(1);
      console.log(
        `  ok ${job.id}  ->  ${path.relative(process.cwd(), job.dest)}  (${kb} KB, q ${result.q}, rmse ${result.rmse.toFixed(2)})`,
      );
      if (job.wire) wires.push(job.id);
    } catch (e) {
      failures++;
      console.error(`  FAIL ${job.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await browser.close();

  if (wires.length > 0) {
    console.log('\nWire these into the book (the tool never edits it):');
    for (const id of wires) {
      console.log(
        `  '${id}': thumbnail: Asset.fromModule(require('./${path.relative(bookDir, path.resolve(args.out, `${id}.thumb.webp`)).replace(/\\\\/g, '/')}')).uri,`,
      );
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} preset(s) failed`);
    process.exit(1);
  }
}

main();
