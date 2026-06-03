// Prebuild asset-copy coverage for the config plugin (app.plugin.js).
//
// The plugin's precompiler reads the consumer's kaleidoscope.presets.ts as TEXT
// (no execution), discovers every `image` layer's plate, resolves each specifier
// to an on-disk .webp, and copies the referenced plates into the native bundle.
// The Android dangerous mod is pure fs (no @expo/config-plugins, no pbxproj), so
// these tests drive it end to end against a real fixture project in a tmpdir and
// assert what landed in the Android assets dir. The parsers (import + require
// binding + image-layer scanning + basename id fallback) and the resolver are
// exercised transitively through that copy.

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import withKaleidoscope from '../app.plugin.js';

type PluginConfig = Parameters<typeof withKaleidoscope>[0];
type DangerousMod = (modConfig: unknown) => Promise<unknown>;

const makeTmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaleidoscope-assets-test-'));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

// A consumer book that exercises every parse path the precompiler supports:
//   - require('./x.webp') literal with an explicit `id`
//   - a `const ... = ...require('./x.webp')...` binding referenced by identifier
//   - an image layer with NO id (falls back to the asset basename)
//   - a require() to a file that does not exist (unresolvable -> warn, skip)
//   - a single named (aliased) package import that won't resolve from a bare
//     tmp project (unresolvable -> warn, skip)
//   - a non-image layer (ignored by the image-layer scanner)
const BOOK = `
import { something } from 'react-native-webrtc-kaleidoscope';
import { oceanscapeDark as oceans } from 'react-native-webrtc-kaleidoscope/images/underwater/oceanscape-dark';
const wolfCave = Asset.fromModule(require('./assets/wolf-cave.webp')).uri;

export const presets = {
  aurora: {
    name: 'Aurora',
    taxonomy: ['Backgrounds'],
    layers: [
      { id: 'sky', shader: 'image', source: require('./assets/aurora.webp') },
      { id: 'cave', shader: 'image', source: wolfCave },
      { shader: 'image', source: require('./assets/nebula.webp') },
      { id: 'ghost', shader: 'image', source: require('./assets/missing.webp') },
      { id: 'deep', shader: 'image', source: oceans },
      { id: 'glow', shader: 'plasma', uniforms: { uSpeed: 0.5 } },
    ],
  },
};
`;

// Lay down a fixture consumer project: the preset book at the root plus the
// .webp plates it can actually resolve (missing.webp and the package import are
// intentionally absent to drive the unresolvable branches).
const writeProject = (root: string, book = BOOK) => {
  fs.writeFileSync(path.join(root, 'kaleidoscope.presets.ts'), book);
  const assets = path.join(root, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  for (const name of ['aurora', 'wolf-cave', 'nebula']) {
    fs.writeFileSync(path.join(assets, `${name}.webp`), `webp:${name}`);
  }
};

// Drive config.mods.android.dangerous the way Expo's mod runner does. An
// optional pre-installed mod lets us assert the plugin CHAINS rather than
// clobbers a prior android.dangerous.
const runAndroidMod = async (
  projectRoot: string,
  platformProjectRoot: string,
  priorMod?: DangerousMod,
) => {
  const base = { name: 'demo', slug: 'demo' } as PluginConfig;
  if (priorMod) {
    (base as { mods?: { android?: { dangerous?: DangerousMod } } }).mods = {
      android: { dangerous: priorMod },
    };
  }
  const config = withKaleidoscope(base);
  const dangerous = (config as { mods?: { android?: { dangerous?: DangerousMod } } }).mods?.android
    ?.dangerous as DangerousMod;
  expect(typeof dangerous).toBe('function');
  return dangerous({ modResults: {}, modRequest: { projectRoot, platformProjectRoot } });
};

const imagesDir = (platformRoot: string) =>
  path.join(platformRoot, 'app', 'src', 'main', 'assets', 'images');

describe('Android prebuild image-plate copy', () => {
  let proj: ReturnType<typeof makeTmp>;
  let plat: ReturnType<typeof makeTmp>;
  let warn: ReturnType<typeof spyOn>;
  let log: ReturnType<typeof spyOn>;

  beforeEach(() => {
    proj = makeTmp();
    plat = makeTmp();
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    log = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
    proj.cleanup();
    plat.cleanup();
  });

  test('copies only the resolvable plates, keyed by layer id (basename fallback when absent)', async () => {
    writeProject(proj.dir);
    await runAndroidMod(proj.dir, plat.dir);

    const dest = imagesDir(plat.dir);
    expect(fs.existsSync(path.join(dest, 'sky.webp'))).toBe(true); // require literal + explicit id
    expect(fs.existsSync(path.join(dest, 'cave.webp'))).toBe(true); // require-binding identifier ref
    expect(fs.existsSync(path.join(dest, 'nebula.webp'))).toBe(true); // id omitted -> basename
    expect(fs.readFileSync(path.join(dest, 'sky.webp'), 'utf8')).toBe('webp:aurora');
  });

  test('skips unresolvable plates and warns instead of throwing', async () => {
    writeProject(proj.dir);
    await runAndroidMod(proj.dir, plat.dir);

    const dest = imagesDir(plat.dir);
    expect(fs.existsSync(path.join(dest, 'ghost.webp'))).toBe(false); // missing.webp
    expect(fs.existsSync(path.join(dest, 'deep.webp'))).toBe(false); // unresolved package import
    // One warning per unresolvable plate (ghost + deep).
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('ignores non-image layers', async () => {
    writeProject(proj.dir);
    await runAndroidMod(proj.dir, plat.dir);
    expect(fs.existsSync(path.join(imagesDir(plat.dir), 'glow.webp'))).toBe(false);
  });

  test('is idempotent across two prebuilds', async () => {
    writeProject(proj.dir);
    await runAndroidMod(proj.dir, plat.dir);
    const first = fs.readdirSync(imagesDir(plat.dir)).sort();
    await runAndroidMod(proj.dir, plat.dir);
    const second = fs.readdirSync(imagesDir(plat.dir)).sort();
    expect(second).toEqual(first);
    expect(first).toEqual(['cave.webp', 'nebula.webp', 'sky.webp']);
  });

  test('chains a previously registered android.dangerous mod', async () => {
    writeProject(proj.dir);
    let priorRan = false;
    const prior: DangerousMod = async (modConfig) => {
      priorRan = true;
      return modConfig;
    };
    await runAndroidMod(proj.dir, plat.dir, prior);
    expect(priorRan).toBe(true);
    expect(fs.existsSync(path.join(imagesDir(plat.dir), 'sky.webp'))).toBe(true);
  });

  test('no preset book: copies nothing, stays quiet, creates no images dir', async () => {
    // proj.dir has no kaleidoscope.presets.ts.
    await runAndroidMod(proj.dir, plat.dir);
    expect(fs.existsSync(imagesDir(plat.dir))).toBe(false);
    expect(warn.mock.calls.length).toBe(0);
  });

  test('a book with no image layers copies nothing', async () => {
    writeProject(
      proj.dir,
      `export const presets = {
        glow: { name: 'Glow', taxonomy: ['Fx'], layers: [
          { id: 'g', shader: 'plasma', uniforms: { uSpeed: 1 } },
        ] },
      };`,
    );
    await runAndroidMod(proj.dir, plat.dir);
    expect(fs.existsSync(imagesDir(plat.dir))).toBe(false);
  });
});

// Plates a packaged composite needs live one indirection past the book: the book
// imports the composite, the composite imports its images. Resolving that needs
// the library package on disk (require.resolve from the project root), so these
// tests install a hermetic fake `react-native-webrtc-kaleidoscope` package into
// the fixture project's node_modules. That exercises resolveCompositeSource,
// the composite branch of collectImageRefs, the composite-thumb collector, and
// the Android thumbnail copy.
const installFakeLibrary = (root: string) => {
  const pkg = path.join(root, 'node_modules', 'react-native-webrtc-kaleidoscope');
  const sceneDir = path.join(pkg, 'composites', 'my-scene');
  const imgDir = path.join(pkg, 'images', 'world');
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.mkdirSync(imgDir, { recursive: true });
  // No `exports` field, so require.resolve of any subpath resolves classically.
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({ name: 'react-native-webrtc-kaleidoscope', version: '0.0.0' }),
  );
  // The composite's image layer uses a composite-relative require; resolveAssetPath
  // resolves it against the composite's own dir.
  fs.writeFileSync(
    path.join(sceneDir, 'my-scene.ts'),
    `export const myScene = {
      name: 'My Scene', taxonomy: ['Worlds'], layers: [
        { id: 'bg', shader: 'image', source: require('../../images/world/backdrop.webp') },
      ],
    };`,
  );
  fs.writeFileSync(path.join(sceneDir, 'my-scene.thumb.webp'), 'webp:thumb');
  fs.writeFileSync(path.join(imgDir, 'backdrop.webp'), 'webp:backdrop');
};

const COMPOSITE_BOOK = `
import { myScene } from 'react-native-webrtc-kaleidoscope/composites/my-scene';
export const presets = { scene: myScene };
`;

describe('Android prebuild copy of packaged-composite assets', () => {
  let proj: ReturnType<typeof makeTmp>;
  let plat: ReturnType<typeof makeTmp>;
  let warn: ReturnType<typeof spyOn>;
  let log: ReturnType<typeof spyOn>;

  beforeEach(() => {
    proj = makeTmp();
    plat = makeTmp();
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    log = spyOn(console, 'log').mockImplementation(() => {});
    fs.writeFileSync(path.join(proj.dir, 'kaleidoscope.presets.ts'), COMPOSITE_BOOK);
    installFakeLibrary(proj.dir);
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
    proj.cleanup();
    plat.cleanup();
  });

  test("copies an imported composite's image-layer plate (resolved one indirection past the book)", async () => {
    await runAndroidMod(proj.dir, plat.dir);
    expect(fs.existsSync(path.join(imagesDir(plat.dir), 'bg.webp'))).toBe(true);
    expect(fs.readFileSync(path.join(imagesDir(plat.dir), 'bg.webp'), 'utf8')).toBe(
      'webp:backdrop',
    );
  });

  test("copies the composite's picker thumbnail under the -thumb id", async () => {
    await runAndroidMod(proj.dir, plat.dir);
    const thumb = path.join(imagesDir(plat.dir), 'my-scene-thumb.webp');
    expect(fs.existsSync(thumb)).toBe(true);
    expect(fs.readFileSync(thumb, 'utf8')).toBe('webp:thumb');
  });
});
