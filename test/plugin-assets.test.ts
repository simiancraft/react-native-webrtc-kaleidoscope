// Prebuild asset-copy coverage for the config plugin (app.plugin.js).
//
// The plugin's precompiler reads the consumer's kaleidoscope.presets.ts as TEXT
// (no execution), discovers every `image` layer's plate, resolves each specifier
// to an on-disk .webp, and copies the referenced plates into the native bundle.
//
// Resolution note: the plugin uses Node's require.resolve({ paths }) to find the
// library package (for imported composites) and @expo/config-plugins (for iOS
// pbxproj registration). Bun's require.resolve honors `paths` inconsistently
// across versions, so these tests do NOT install throwaway fakes and redirect
// via `paths`; instead they SYMLINK the REAL repo packages into the fixture
// project's node_modules, which resolves identically under every runtime, and
// use a REAL packaged composite (underwater) plus the React Native template
// pbxproj as fixtures. That also raises fidelity: the iOS path exercises the
// real XcodeUtils, not a stub.

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import withKaleidoscope from '../app.plugin.js';

type PluginConfig = Parameters<typeof withKaleidoscope>[0];
type DangerousMod = (modConfig: unknown) => Promise<unknown>;

const repoRoot = path.resolve(import.meta.dir, '..');
const TEMPLATE_PBXPROJ = path.join(
  repoRoot,
  'node_modules/react-native/template/ios/HelloWorld.xcodeproj/project.pbxproj',
);

const makeTmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaleidoscope-assets-test-'));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

// Symlink the real @expo/config-plugins so the iOS mod's dynamic require.resolve
// loads the real XcodeUtils.
const linkRealConfigPlugins = (root: string) => {
  const expo = path.join(root, 'node_modules', '@expo');
  fs.mkdirSync(expo, { recursive: true });
  fs.symlinkSync(
    path.join(repoRoot, 'node_modules', '@expo', 'config-plugins'),
    path.join(expo, 'config-plugins'),
    'dir',
  );
};

// Drop a parseable project.pbxproj under <iosRoot>/<name>.xcodeproj so the real
// XcodeUtils.getPbxproj can read it and register resources.
const installPbxproj = (iosRoot: string, name = 'Demo') => {
  const xcodeproj = path.join(iosRoot, `${name}.xcodeproj`);
  fs.mkdirSync(xcodeproj, { recursive: true });
  fs.copyFileSync(TEMPLATE_PBXPROJ, path.join(xcodeproj, 'project.pbxproj'));
};

// A consumer book that exercises every inline parse path the precompiler
// supports: a require('./x.webp') literal with an explicit id, a require-binding
// referenced by identifier, an image layer with no id (basename fallback), a
// require() to a missing file (unresolvable -> warn, skip), an aliased package
// import that won't resolve (unresolvable -> warn, skip), and a non-image layer.
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

// A book whose every plate is unresolvable (no assets on disk).
const UNRESOLVABLE_BOOK = `
export const presets = {
  a: { name: 'A', taxonomy: ['x'], layers: [
    { id: 'gone', shader: 'image', source: require('./assets/gone.webp') },
  ] },
};
`;

const writeBook = (root: string, book: string) =>
  fs.writeFileSync(path.join(root, 'kaleidoscope.presets.ts'), book);

// Lay down the BOOK plus the .webp plates it can resolve (missing.webp and the
// package import are intentionally absent to drive the unresolvable branches).
const writeInlineProject = (root: string) => {
  writeBook(root, BOOK);
  const assets = path.join(root, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  for (const name of ['aurora', 'wolf-cave', 'nebula']) {
    fs.writeFileSync(path.join(assets, `${name}.webp`), `webp:${name}`);
  }
};

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

const runIosMod = async (projectRoot: string, platformProjectRoot: string) => {
  const config = withKaleidoscope({ name: 'demo', slug: 'demo' } as PluginConfig);
  const dangerous = (config as { mods?: { ios?: { dangerous?: DangerousMod } } }).mods?.ios
    ?.dangerous as DangerousMod;
  expect(typeof dangerous).toBe('function');
  return dangerous({ modResults: {}, modRequest: { projectRoot, platformProjectRoot } });
};

const androidImagesDir = (platformRoot: string) =>
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
    writeInlineProject(proj.dir);
    await runAndroidMod(proj.dir, plat.dir);

    const dest = androidImagesDir(plat.dir);
    expect(fs.existsSync(path.join(dest, 'sky.webp'))).toBe(true); // require literal + explicit id
    expect(fs.existsSync(path.join(dest, 'cave.webp'))).toBe(true); // require-binding identifier ref
    expect(fs.existsSync(path.join(dest, 'nebula.webp'))).toBe(true); // id omitted -> basename
    expect(fs.readFileSync(path.join(dest, 'sky.webp'), 'utf8')).toBe('webp:aurora');
  });

  test('skips unresolvable plates and warns instead of throwing', async () => {
    writeInlineProject(proj.dir);
    await runAndroidMod(proj.dir, plat.dir);

    const dest = androidImagesDir(plat.dir);
    expect(fs.existsSync(path.join(dest, 'ghost.webp'))).toBe(false); // missing.webp
    expect(fs.existsSync(path.join(dest, 'deep.webp'))).toBe(false); // unresolved package import
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('ignores non-image layers', async () => {
    writeInlineProject(proj.dir);
    await runAndroidMod(proj.dir, plat.dir);
    expect(fs.existsSync(path.join(androidImagesDir(plat.dir), 'glow.webp'))).toBe(false);
  });

  test('is idempotent across two prebuilds', async () => {
    writeInlineProject(proj.dir);
    await runAndroidMod(proj.dir, plat.dir);
    const first = fs.readdirSync(androidImagesDir(plat.dir)).sort();
    await runAndroidMod(proj.dir, plat.dir);
    const second = fs.readdirSync(androidImagesDir(plat.dir)).sort();
    expect(second).toEqual(first);
    expect(first).toEqual(['cave.webp', 'nebula.webp', 'sky.webp']);
  });

  test('chains a previously registered android.dangerous mod', async () => {
    writeInlineProject(proj.dir);
    let priorRan = false;
    const prior: DangerousMod = async (modConfig) => {
      priorRan = true;
      return modConfig;
    };
    await runAndroidMod(proj.dir, plat.dir, prior);
    expect(priorRan).toBe(true);
    expect(fs.existsSync(path.join(androidImagesDir(plat.dir), 'sky.webp'))).toBe(true);
  });

  test('no preset book: copies nothing, stays quiet, creates no images dir', async () => {
    await runAndroidMod(proj.dir, plat.dir);
    expect(fs.existsSync(androidImagesDir(plat.dir))).toBe(false);
    expect(warn.mock.calls.length).toBe(0);
  });

  test('a book with no image layers copies nothing', async () => {
    writeBook(
      proj.dir,
      `export const presets = {
        glow: { name: 'Glow', taxonomy: ['Fx'], layers: [
          { id: 'g', shader: 'plasma', uniforms: { uSpeed: 1 } },
        ] },
      };`,
    );
    await runAndroidMod(proj.dir, plat.dir);
    expect(fs.existsSync(androidImagesDir(plat.dir))).toBe(false);
  });
});

// NOTE: the imported-composite copy path (resolveCompositeSource) resolves the
// library package by NAME via require.resolve({ paths }). That is correct under
// Node (where Expo prebuild runs), but the Bun test runner resolves a bare
// package name to its own install cache / self-reference and ignores `paths`, so
// a fixture project cannot deterministically point it at a controlled composite.
// It is therefore covered at prebuild integration time, not here; these tests
// cover the inline-plate and iOS-registration paths, which resolve assets by
// filesystem path and are runtime-agnostic.

describe('iOS prebuild asset copy + pbxproj registration', () => {
  let proj: ReturnType<typeof makeTmp>;
  let warn: ReturnType<typeof spyOn>;
  let log: ReturnType<typeof spyOn>;
  let iosRoot: string;

  const pbxproj = () =>
    fs.readFileSync(path.join(iosRoot, 'Demo.xcodeproj', 'project.pbxproj'), 'utf8');

  beforeEach(() => {
    proj = makeTmp();
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    log = spyOn(console, 'log').mockImplementation(() => {});
    iosRoot = path.join(proj.dir, 'ios');
    fs.mkdirSync(iosRoot, { recursive: true });
    linkRealConfigPlugins(proj.dir);
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
    proj.cleanup();
  });

  test('copies inline plates into the app target and registers them in the pbxproj', async () => {
    writeInlineProject(proj.dir);
    installPbxproj(iosRoot);
    await runIosMod(proj.dir, iosRoot);

    const target = path.join(iosRoot, 'Demo');
    expect(fs.existsSync(path.join(target, 'sky.webp'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'nebula.webp'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'ghost.webp'))).toBe(false); // unresolvable, skipped
    const pbx = pbxproj();
    expect(pbx).toContain('sky.webp');
    expect(pbx).toContain('nebula.webp');
  });

  test('all plates unresolvable: copies and registers nothing', async () => {
    writeBook(proj.dir, UNRESOLVABLE_BOOK);
    installPbxproj(iosRoot);
    await runIosMod(proj.dir, iosRoot);
    expect(fs.existsSync(path.join(iosRoot, 'Demo', 'gone.webp'))).toBe(false);
    expect(pbxproj()).not.toContain('gone.webp');
  });

  test('pbxproj read failure (no project.pbxproj yet) warns, copies, registers nothing', async () => {
    writeInlineProject(proj.dir);
    // .xcodeproj dir exists so projectName resolves, but no project.pbxproj to read.
    fs.mkdirSync(path.join(iosRoot, 'Demo.xcodeproj'), { recursive: true });
    await runIosMod(proj.dir, iosRoot);
    expect(fs.existsSync(path.join(iosRoot, 'Demo', 'sky.webp'))).toBe(true); // copied
    expect(fs.existsSync(path.join(iosRoot, 'Demo.xcodeproj', 'project.pbxproj'))).toBe(false);
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('no .xcodeproj under the iOS root yet: skips registration without throwing', async () => {
    writeInlineProject(proj.dir);
    await runIosMod(proj.dir, iosRoot);
    expect(fs.existsSync(path.join(iosRoot, 'Demo'))).toBe(false);
  });
});

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

  test('Android copy failure (platformProjectRoot is a file) warns, does not throw', async () => {
    writeInlineProject(proj.dir);
    const platFile = path.join(proj.dir, 'not-a-dir');
    fs.writeFileSync(platFile, 'x'); // mkdirSync(destDir) under a file throws
    await runAndroidMod(proj.dir, platFile);
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
