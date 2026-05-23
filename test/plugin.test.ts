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
const runIosDangerousMod = async (platformProjectRoot: string) => {
  const config = withKaleidoscope({ name: 'demo', slug: 'demo' } as Parameters<
    typeof withKaleidoscope
  >[0]);
  const mods = (config as { mods?: { ios?: { dangerous?: unknown } } }).mods;
  const dangerous = mods?.ios?.dangerous as (modConfig: unknown) => Promise<unknown>;
  expect(typeof dangerous).toBe('function');
  // `projectRoot` is left undefined so resolveWebrtcPod returns the default
  // (no fork lookup against node_modules). Podfile.properties.json patching
  // is independent of the Podfile patch.
  await dangerous({
    modResults: {},
    modRequest: {
      platformProjectRoot,
      projectRoot: undefined,
    },
  });
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
});
