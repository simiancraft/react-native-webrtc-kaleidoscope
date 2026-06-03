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

// The iOS copy registers each plate in the app target's pbxproj via
// @expo/config-plugins' IOSConfig.XcodeUtils, which the plugin loads with a
// dynamic require.resolve from the project root. Installing a STUB config-plugins
// into the fixture's node_modules lets these tests drive copyIosImages /
// copyIosThumbnails end to end (copy + resource registration) without standing
// up a real Xcode project: the stub's getPbxproj returns a fake project whose
// writeSync serializes the registered filepaths, so the written project.pbxproj
// is a readable record of what got added to the build phase.
const installFakeConfigPlugins = (root: string) => {
  const mod = path.join(root, 'node_modules', '@expo', 'config-plugins');
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(
    path.join(mod, 'package.json'),
    JSON.stringify({ name: '@expo/config-plugins', version: '0.0.0', main: 'index.js' }),
  );
  fs.writeFileSync(
    path.join(mod, 'index.js'),
    // Module-level accumulator mimics the real getPbxproj, which RE-READS the
    // pbxproj each call so a second registration pass (thumbnails) sees the
    // first's (images) additions instead of clobbering them.
    `let added = [];
    module.exports = {
      IOSConfig: {
        XcodeUtils: {
          getPbxproj() {
            return { writeSync() { return 'PBX\\n' + added.join('\\n'); } };
          },
          addResourceFileToGroup({ filepath }) {
            added.push(filepath);
          },
        },
      },
    };`,
  );
};

// Drive config.mods.ios.dangerous with a real projectRoot + platformProjectRoot.
const runIosMod = async (projectRoot: string, platformProjectRoot: string) => {
  const config = withKaleidoscope({ name: 'demo', slug: 'demo' } as PluginConfig);
  const dangerous = (config as { mods?: { ios?: { dangerous?: DangerousMod } } }).mods?.ios
    ?.dangerous as DangerousMod;
  expect(typeof dangerous).toBe('function');
  return dangerous({ modResults: {}, modRequest: { projectRoot, platformProjectRoot } });
};

describe('iOS prebuild asset copy + pbxproj registration', () => {
  let proj: ReturnType<typeof makeTmp>;
  let warn: ReturnType<typeof spyOn>;
  let log: ReturnType<typeof spyOn>;
  // platformProjectRoot is the iOS dir under the project root, with a .xcodeproj
  // beside the target group dir; the mod reads/writes the pbxproj here.
  let iosRoot: string;

  const pbxprojContent = () =>
    fs.readFileSync(path.join(iosRoot, 'Demo.xcodeproj', 'project.pbxproj'), 'utf8');

  beforeEach(() => {
    proj = makeTmp();
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    log = spyOn(console, 'log').mockImplementation(() => {});
    iosRoot = path.join(proj.dir, 'ios');
    fs.mkdirSync(path.join(iosRoot, 'Demo.xcodeproj'), { recursive: true });
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
    proj.cleanup();
  });

  test('copies resolvable plates into the app target and registers them in the pbxproj', async () => {
    writeProject(proj.dir);
    installFakeConfigPlugins(proj.dir);
    await runIosMod(proj.dir, iosRoot);

    const target = path.join(iosRoot, 'Demo');
    expect(fs.existsSync(path.join(target, 'sky.webp'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'cave.webp'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'nebula.webp'))).toBe(true);
    // Unresolvable plates are skipped, not copied.
    expect(fs.existsSync(path.join(target, 'ghost.webp'))).toBe(false);
    // Each copied plate is registered in the target's Copy Bundle Resources phase.
    const pbx = pbxprojContent();
    expect(pbx).toContain('Demo/sky.webp');
    expect(pbx).toContain('Demo/nebula.webp');
  });

  test("copies and registers a packaged composite's plate and thumbnail", async () => {
    fs.writeFileSync(path.join(proj.dir, 'kaleidoscope.presets.ts'), COMPOSITE_BOOK);
    installFakeLibrary(proj.dir);
    installFakeConfigPlugins(proj.dir);
    await runIosMod(proj.dir, iosRoot);

    const target = path.join(iosRoot, 'Demo');
    expect(fs.existsSync(path.join(target, 'bg.webp'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'my-scene-thumb.webp'))).toBe(true);
    const pbx = pbxprojContent();
    expect(pbx).toContain('Demo/bg.webp');
    expect(pbx).toContain('Demo/my-scene-thumb.webp');
  });

  test('without @expo/config-plugins resolvable, warns and registers nothing (CI prebuild case)', async () => {
    writeProject(proj.dir); // no installFakeConfigPlugins
    await runIosMod(proj.dir, iosRoot);
    // The pbxproj is never written because the registration toolkit is absent.
    expect(fs.existsSync(path.join(iosRoot, 'Demo.xcodeproj', 'project.pbxproj'))).toBe(false);
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('no .xcodeproj under the iOS root yet: skips registration without throwing', async () => {
    writeProject(proj.dir);
    installFakeConfigPlugins(proj.dir);
    fs.rmSync(path.join(iosRoot, 'Demo.xcodeproj'), { recursive: true, force: true });
    await runIosMod(proj.dir, iosRoot);
    expect(fs.existsSync(path.join(iosRoot, 'Demo'))).toBe(false);
  });
});

// A stub @expo/config-plugins whose getPbxproj THROWS, to drive the
// pbxproj-read failure branch (warn, never throw).
const installThrowingConfigPlugins = (root: string) => {
  const mod = path.join(root, 'node_modules', '@expo', 'config-plugins');
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(
    path.join(mod, 'package.json'),
    JSON.stringify({ name: '@expo/config-plugins', version: '0.0.0', main: 'index.js' }),
  );
  fs.writeFileSync(
    path.join(mod, 'index.js'),
    `module.exports = {
      IOSConfig: {
        XcodeUtils: {
          getPbxproj() { throw new Error('no pbxproj'); },
          addResourceFileToGroup() {},
        },
      },
    };`,
  );
};

// An image book whose every plate is unresolvable (no assets on disk).
const UNRESOLVABLE_BOOK = `
export const presets = {
  a: { name: 'A', taxonomy: ['x'], layers: [
    { id: 'gone', shader: 'image', source: require('./assets/gone.webp') },
  ] },
};
`;

// The plugin's contract is non-fatal: every I/O or resolution failure warns and
// the build proceeds. These tests drive the catch/early-return branches.
describe('config plugin non-fatal error branches', () => {
  let proj: ReturnType<typeof makeTmp>;
  let warn: ReturnType<typeof spyOn>;
  let log: ReturnType<typeof spyOn>;

  beforeEach(() => {
    proj = makeTmp();
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    log = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
    proj.cleanup();
  });

  test('an imported composite that does not resolve contributes no plates', async () => {
    // COMPOSITE_BOOK with no fake library installed: require.resolve throws,
    // resolveCompositeSource swallows it and returns null.
    fs.writeFileSync(path.join(proj.dir, 'kaleidoscope.presets.ts'), COMPOSITE_BOOK);
    const plat = makeTmp();
    await runAndroidMod(proj.dir, plat.dir);
    expect(fs.existsSync(imagesDir(plat.dir))).toBe(false);
    plat.cleanup();
  });

  test('Android copy failure (platformProjectRoot is a file) warns, does not throw', async () => {
    writeProject(proj.dir);
    const platFile = path.join(proj.dir, 'not-a-dir');
    fs.writeFileSync(platFile, 'x'); // mkdirSync(destDir) under a file throws
    await runAndroidMod(proj.dir, platFile);
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('iOS with all plates unresolvable registers nothing', async () => {
    fs.writeFileSync(path.join(proj.dir, 'kaleidoscope.presets.ts'), UNRESOLVABLE_BOOK);
    installFakeConfigPlugins(proj.dir);
    const iosRoot = path.join(proj.dir, 'ios');
    fs.mkdirSync(path.join(iosRoot, 'Demo.xcodeproj'), { recursive: true });
    await runIosMod(proj.dir, iosRoot);
    expect(fs.existsSync(path.join(iosRoot, 'Demo.xcodeproj', 'project.pbxproj'))).toBe(false);
  });

  test('iOS pbxproj read failure warns, does not throw', async () => {
    writeProject(proj.dir);
    installThrowingConfigPlugins(proj.dir);
    const iosRoot = path.join(proj.dir, 'ios');
    fs.mkdirSync(path.join(iosRoot, 'Demo.xcodeproj'), { recursive: true });
    await runIosMod(proj.dir, iosRoot);
    // Plates are copied, but registration bails on the pbxproj read error.
    expect(fs.existsSync(path.join(iosRoot, 'Demo', 'sky.webp'))).toBe(true);
    expect(fs.existsSync(path.join(iosRoot, 'Demo.xcodeproj', 'project.pbxproj'))).toBe(false);
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('a non-readable Podfile.properties.json (a directory) skips the bump, does not clobber', async () => {
    const iosRoot = path.join(proj.dir, 'ios');
    fs.mkdirSync(iosRoot, { recursive: true });
    // A directory where the JSON file should be: readFileSync throws EISDIR
    // (not ENOENT), so the mod warns and bails rather than overwriting.
    const propsPath = path.join(iosRoot, 'Podfile.properties.json');
    fs.mkdirSync(propsPath);
    await runIosMod(proj.dir, iosRoot);
    expect(fs.statSync(propsPath).isDirectory()).toBe(true); // untouched
  });
});
