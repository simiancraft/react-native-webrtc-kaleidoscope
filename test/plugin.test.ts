import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import withKaleidoscope from '../app.plugin.js';

describe('withKaleidoscope', () => {
  test('is a function', () => {
    expect(typeof withKaleidoscope).toBe('function');
  });

  test('returns a usable config object', () => {
    const config = { name: 'demo', slug: 'demo' };
    const result = withKaleidoscope(config as unknown as Parameters<typeof withKaleidoscope>[0]);
    expect(result).toBeDefined();
    expect(result.name).toBe('demo');
  });
});

// Cross-platform tmpdir helper that returns a fresh directory plus a teardown.
// We avoid hand-rolling per-test cleanup so a test crash never leaks files.
const makeTmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaleidoscope-plugin-test-'));
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
};

// Minimal Podfile stub that exercises the modular-headers patch's target-block
// insertion without dragging in the full Expo-generated template. The mod
// patches `Podfile` and `Podfile.properties.json` independently; we install
// a stub for the former so its warning doesn't drown test output.
const STUB_PODFILE = `platform :ios, '13.4'

target 'Demo' do
end
`;

// Drive the dangerous mod the way Expo's mod runner does: invoke
// `config.mods.ios.dangerous` with a `modConfig` that carries `modRequest`.
// The mod chains a previous mod (none here), then patches files at
// `platformProjectRoot`. The returned config is irrelevant for these tests —
// we assert on the files it wrote.
const runIosDangerousMod = async (platformProjectRoot: string, projectRoot?: string) => {
  const config = withKaleidoscope({ name: 'demo', slug: 'demo' } as Parameters<
    typeof withKaleidoscope
  >[0]);
  const mods = (config as { mods?: { ios?: { dangerous?: unknown } } }).mods;
  const dangerous = mods?.ios?.dangerous as (modConfig: unknown) => Promise<unknown>;
  expect(typeof dangerous).toBe('function');
  // `projectRoot` defaults to undefined so resolveWebrtcPod returns the default
  // (no fork lookup against node_modules). The deployment-target bump reads the
  // host RN floor from `projectRoot`; pass one to exercise that path.
  await dangerous({
    modResults: {},
    modRequest: {
      platformProjectRoot,
      projectRoot,
    },
  });
};

// Stage a fake `react-native` under `<root>/node_modules` exposing the given
// iOS floor via scripts/cocoapods/helpers.rb, the same file the plugin reads.
const stageReactNative = (root: string, iosFloor: string) => {
  const rnRoot = path.join(root, 'node_modules', 'react-native');
  fs.mkdirSync(path.join(rnRoot, 'scripts', 'cocoapods'), { recursive: true });
  fs.writeFileSync(
    path.join(rnRoot, 'package.json'),
    `${JSON.stringify({ name: 'react-native', version: '0.0.0', main: 'index.js' })}\n`,
  );
  fs.writeFileSync(
    path.join(rnRoot, 'scripts', 'cocoapods', 'helpers.rb'),
    `module Helpers\n  class Constants\n    def self.min_ios_version_supported\n      return '${iosFloor}'\n    end\n  end\nend\n`,
  );
};

describe('withKaleidoscope iOS deployment-target patch', () => {
  let tmp: ReturnType<typeof makeTmp>;

  beforeEach(() => {
    tmp = makeTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  test('writes ios.deploymentTarget 15.0 into an empty Podfile.properties.json', async () => {
    fs.writeFileSync(path.join(tmp.dir, 'Podfile'), STUB_PODFILE);
    const propsPath = path.join(tmp.dir, 'Podfile.properties.json');
    fs.writeFileSync(propsPath, '{}\n');

    await runIosDangerousMod(tmp.dir);

    const after = JSON.parse(fs.readFileSync(propsPath, 'utf8')) as Record<string, unknown>;
    expect(after['ios.deploymentTarget']).toBe('15.0');
  });

  test('is idempotent: two runs produce byte-identical output', async () => {
    fs.writeFileSync(path.join(tmp.dir, 'Podfile'), STUB_PODFILE);
    const propsPath = path.join(tmp.dir, 'Podfile.properties.json');
    fs.writeFileSync(propsPath, '{}\n');

    await runIosDangerousMod(tmp.dir);
    const first = fs.readFileSync(propsPath, 'utf8');

    await runIosDangerousMod(tmp.dir);
    const second = fs.readFileSync(propsPath, 'utf8');

    expect(second).toBe(first);
  });

  test('does not downgrade a higher consumer-set value (15.5 stays 15.5)', async () => {
    fs.writeFileSync(path.join(tmp.dir, 'Podfile'), STUB_PODFILE);
    const propsPath = path.join(tmp.dir, 'Podfile.properties.json');
    fs.writeFileSync(propsPath, `${JSON.stringify({ 'ios.deploymentTarget': '15.5' }, null, 2)}\n`);

    await runIosDangerousMod(tmp.dir);

    const after = JSON.parse(fs.readFileSync(propsPath, 'utf8')) as Record<string, unknown>;
    expect(after['ios.deploymentTarget']).toBe('15.5');
  });

  test('raises to the host RN floor when it exceeds the library floor (RN 0.81 -> 15.1)', async () => {
    // Regression for #86: a hardcoded 15.0 lowered RN 0.81's 15.1 floor and
    // broke pod install on ReactAppDependencyProvider.
    stageReactNative(tmp.dir, '15.1');
    fs.writeFileSync(path.join(tmp.dir, 'Podfile'), STUB_PODFILE);
    const propsPath = path.join(tmp.dir, 'Podfile.properties.json');
    fs.writeFileSync(propsPath, '{}\n');

    await runIosDangerousMod(tmp.dir, tmp.dir);

    const after = JSON.parse(fs.readFileSync(propsPath, 'utf8')) as Record<string, unknown>;
    expect(after['ios.deploymentTarget']).toBe('15.1');
  });

  test('keeps the library floor when the host RN floor is lower (RN 0.74 -> 15.0)', async () => {
    stageReactNative(tmp.dir, '13.4');
    fs.writeFileSync(path.join(tmp.dir, 'Podfile'), STUB_PODFILE);
    const propsPath = path.join(tmp.dir, 'Podfile.properties.json');
    fs.writeFileSync(propsPath, '{}\n');

    await runIosDangerousMod(tmp.dir, tmp.dir);

    const after = JSON.parse(fs.readFileSync(propsPath, 'utf8')) as Record<string, unknown>;
    expect(after['ios.deploymentTarget']).toBe('15.0');
  });
});

// Build a temp consumer project: <root>/node_modules/<pkg> markers + <root>/ios.
// `resolveWebrtcPod` probes node_modules with fs.existsSync, so a bare directory
// per package is enough to exercise the fork/upstream resolution.
const makeProject = (pkgs: ReadonlyArray<string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaleidoscope-proj-'));
  for (const pkg of pkgs) {
    fs.mkdirSync(path.join(root, 'node_modules', pkg), { recursive: true });
  }
  const iosDir = path.join(root, 'ios');
  fs.mkdirSync(iosDir, { recursive: true });
  return { root, iosDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
};

// Invoke the registered iOS dangerous mod with a real projectRoot (so the pod
// resolver runs) and an optional previously-registered mod to chain.
const runMod = (
  projectRoot: string | undefined,
  platformProjectRoot: string,
  previousMod?: (c: unknown) => unknown,
): Promise<unknown> => {
  const base = { name: 'demo', slug: 'demo' } as Parameters<typeof withKaleidoscope>[0];
  if (previousMod) {
    (base as { mods?: { ios?: { dangerous?: unknown } } }).mods = {
      ios: { dangerous: previousMod },
    };
  }
  const config = withKaleidoscope(base);
  const dangerous = (
    config as { mods?: { ios?: { dangerous?: (m: unknown) => Promise<unknown> } } }
  ).mods?.ios?.dangerous;
  if (typeof dangerous !== 'function') throw new Error('dangerous mod not registered');
  return dangerous({ modResults: {}, modRequest: { platformProjectRoot, projectRoot } });
};

describe('withKaleidoscope Podfile modular-headers patch', () => {
  test('injects react-native-webrtc with modular_headers when upstream is installed', async () => {
    const proj = makeProject(['react-native-webrtc']);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile'), STUB_PODFILE);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), '{}\n');
    try {
      await runMod(proj.root, proj.iosDir);
      const podfile = fs.readFileSync(path.join(proj.iosDir, 'Podfile'), 'utf8');
      expect(podfile).toContain("pod 'react-native-webrtc'");
      expect(podfile).toContain(':modular_headers => true');
      expect(podfile).toContain('react-native-webrtc-kaleidoscope: modular headers');
    } finally {
      proj.cleanup();
    }
  });

  test('prefers the @livekit fork pod name when both forks are installed', async () => {
    const proj = makeProject(['react-native-webrtc', '@livekit/react-native-webrtc']);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile'), STUB_PODFILE);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), '{}\n');
    try {
      await runMod(proj.root, proj.iosDir);
      const podfile = fs.readFileSync(path.join(proj.iosDir, 'Podfile'), 'utf8');
      expect(podfile).toContain("pod 'livekit-react-native-webrtc'");
    } finally {
      proj.cleanup();
    }
  });

  test('leaves the Podfile untouched when neither fork is installed', async () => {
    const proj = makeProject([]);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile'), STUB_PODFILE);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), '{}\n');
    try {
      await runMod(proj.root, proj.iosDir);
      expect(fs.readFileSync(path.join(proj.iosDir, 'Podfile'), 'utf8')).toBe(STUB_PODFILE);
    } finally {
      proj.cleanup();
    }
  });

  test('appends the pod when the Podfile has no target block', async () => {
    const proj = makeProject(['react-native-webrtc']);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile'), "platform :ios, '13.4'\n");
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), '{}\n');
    try {
      await runMod(proj.root, proj.iosDir);
      expect(fs.readFileSync(path.join(proj.iosDir, 'Podfile'), 'utf8')).toContain(
        ':modular_headers => true',
      );
    } finally {
      proj.cleanup();
    }
  });

  test('is idempotent: the modular-headers block is not duplicated', async () => {
    const proj = makeProject(['react-native-webrtc']);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile'), STUB_PODFILE);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), '{}\n');
    try {
      await runMod(proj.root, proj.iosDir);
      const first = fs.readFileSync(path.join(proj.iosDir, 'Podfile'), 'utf8');
      await runMod(proj.root, proj.iosDir);
      const second = fs.readFileSync(path.join(proj.iosDir, 'Podfile'), 'utf8');
      expect(second).toBe(first);
      expect(second.match(/:modular_headers => true/g)?.length).toBe(1);
    } finally {
      proj.cleanup();
    }
  });
});

describe('withKaleidoscope resilience', () => {
  test('creates Podfile.properties.json when it is absent', async () => {
    const proj = makeProject(['react-native-webrtc']);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile'), STUB_PODFILE);
    try {
      await runMod(proj.root, proj.iosDir);
      const props = JSON.parse(
        fs.readFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(props['ios.deploymentTarget']).toBe('15.0');
    } finally {
      proj.cleanup();
    }
  });

  test('rewrites corrupt Podfile.properties.json with the required target', async () => {
    const proj = makeProject(['react-native-webrtc']);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile'), STUB_PODFILE);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), 'not valid json {');
    try {
      await runMod(proj.root, proj.iosDir);
      const props = JSON.parse(
        fs.readFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(props['ios.deploymentTarget']).toBe('15.0');
    } finally {
      proj.cleanup();
    }
  });

  test('warns but does not throw, and still bumps the target, when the Podfile is missing', async () => {
    const proj = makeProject(['react-native-webrtc']);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), '{}\n');
    try {
      await runMod(proj.root, proj.iosDir);
      const props = JSON.parse(
        fs.readFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(props['ios.deploymentTarget']).toBe('15.0');
    } finally {
      proj.cleanup();
    }
  });

  test('chains a previously registered iOS dangerous mod', async () => {
    const proj = makeProject(['react-native-webrtc']);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile'), STUB_PODFILE);
    fs.writeFileSync(path.join(proj.iosDir, 'Podfile.properties.json'), '{}\n');
    let previousCalled = false;
    const previousMod = (c: unknown): unknown => {
      previousCalled = true;
      return c;
    };
    try {
      await runMod(proj.root, proj.iosDir, previousMod);
      expect(previousCalled).toBe(true);
    } finally {
      proj.cleanup();
    }
  });
});
