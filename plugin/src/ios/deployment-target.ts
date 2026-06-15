import fs from 'node:fs';
import path from 'node:path';
import { LOG_TAG } from '../lib/constants';

// The LIBRARY's own iOS floor; mirrors ios/Kaleidoscope.podspec :ios => '15.0'
// (Metal effect pipeline + Vision person segmentation). This is only a FLOOR:
// the value actually written is max(this, the host React Native's iOS floor),
// so the plugin can never lower the Podfile platform below what RN's own core
// pods require.
//
// Why the max matters: expo-modules-autolinking drops any pod whose declared
// minimum platform EXCEEDS the Podfile platform, so the plugin must raise the
// Podfile to keep the Kaleidoscope pod. But RN moves its floor between versions
// (13.4 on 0.74, 15.1 on 0.81); writing a hardcoded 15.0 on a host whose floor
// is 15.1 LOWERS the platform and breaks pod install on RN's core pods
// (ReactAppDependencyProvider et al). Taking the max fixes that for any current
// or future RN floor.
const IOS_DEPLOYMENT_TARGET = '15.0';

/**
 * Compare two dotted version strings element-wise. Returns true iff `existing`
 * is strictly less than `target`. Missing/empty existing counts as "less than".
 * No `semver` dependency, so this file stays loadable on an EAS worker with no
 * node_modules; the iOS deployment target is a plain dotted version like '15.0'.
 */
function isVersionLessThan(existing: string | undefined, target: string): boolean {
  if (typeof existing !== 'string' || existing.length === 0) return true;
  const toParts = (s: string): number[] => s.split('.').map((part) => Number(part) || 0);
  const a = toParts(existing);
  const b = toParts(target);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return true;
    if (av > bv) return false;
  }
  return false; // equal
}

/** The larger of two dotted version strings (ties return `a`). */
function maxVersion(a: string, b: string): string {
  return isVersionLessThan(a, b) ? b : a;
}

/**
 * Read the host React Native's iOS floor (`Helpers::Constants
 * .min_ios_version_supported` in `scripts/cocoapods/helpers.rb`), resolved from
 * the CONSUMER's installed `react-native`. Returns the dotted version, or
 * `undefined` if RN cannot be resolved or the constant cannot be parsed.
 *
 * Deliberately dependency-free: resolves a path and reads a file (mirrors how
 * assets.ts resolves `@expo/config-plugins`), so the plugin stays loadable on
 * an EAS worker. The generated Podfile defaults the platform to RN's floor when
 * `ios.deploymentTarget` is unset; reading the same value here lets the plugin
 * write max(library floor, RN floor) instead of a stale hardcoded constant.
 */
function readReactNativeIosFloor(projectRoot: string): string | undefined {
  try {
    const rnPkg = require.resolve('react-native/package.json', { paths: [projectRoot] });
    const helpers = path.join(path.dirname(rnPkg), 'scripts', 'cocoapods', 'helpers.rb');
    const raw = fs.readFileSync(helpers, 'utf8');
    const match = raw.match(
      /min_ios_version_supported[\s\S]*?return\s+['"]([0-9]+(?:\.[0-9]+)*)['"]/,
    );
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Raise `ios.deploymentTarget` in Podfile.properties.json to the library
 * minimum. The generated Podfile reads `podfile_properties['ios.deploymentTarget']`
 * at the top, so this is the canonical, no-Podfile-edit override seam. Without
 * this bump the Kaleidoscope pod is silently dropped and the runtime module
 * lookup throws. Non-downgrading, idempotent, non-fatal (warn, never throw).
 *
 * Reads the file by hand (not readTextOrNull) because it must DISTINGUISH a
 * missing file (treat as `{}` and write the bump) from an unreadable one (bail
 * without clobbering); a distinction readTextOrNull deliberately flattens.
 */
export function bumpDeploymentTarget(platformProjectRoot: string, projectRoot?: string): void {
  const propsPath = path.join(platformProjectRoot, 'Podfile.properties.json');
  // Never write below the host RN's floor. `platformProjectRoot` is `<root>/ios`,
  // so its parent is the JS project root when an explicit `projectRoot` is absent.
  const rnFloor = readReactNativeIosFloor(projectRoot ?? path.dirname(platformProjectRoot));
  const target = rnFloor ? maxVersion(IOS_DEPLOYMENT_TARGET, rnFloor) : IOS_DEPLOYMENT_TARGET;
  try {
    let parsed: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(propsPath, 'utf8');
      try {
        const candidate: unknown = JSON.parse(raw);
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          parsed = candidate as Record<string, unknown>;
        }
      } catch (jsonError) {
        // Corrupt JSON: warn but proceed with `{}` so the build still gets the
        // bump it needs. The next prebuild fully regenerates the file anyway.
        console.warn(
          `${LOG_TAG} Could not parse ${propsPath}; rewriting with defaults. ${String(jsonError)}`,
        );
        parsed = {};
      }
    } catch (readError) {
      const code = (readError as { code?: string } | null)?.code;
      if (code === 'ENOENT') {
        parsed = {};
      } else {
        // Transient I/O failure (EACCES, EISDIR, ...). Don't clobber the file
        // when we could not actually read it; warn and skip the bump.
        console.warn(
          `${LOG_TAG} Could not read ${propsPath}; skipping iOS deployment-target bump. ${String(readError)}`,
        );
        return;
      }
    }
    // Explicit own-key copy into a fresh object to foreclose
    // `__proto__`-as-literal-key surprises from JSON.parse.
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(parsed)) {
      next[key] = parsed[key];
    }
    const existing = next['ios.deploymentTarget'];
    if (isVersionLessThan(typeof existing === 'string' ? existing : undefined, target)) {
      next['ios.deploymentTarget'] = target;
    }
    fs.writeFileSync(propsPath, `${JSON.stringify(next, null, 2)}\n`);
  } catch (error) {
    console.warn(
      `${LOG_TAG} Could not patch ${propsPath} to raise iOS deployment target; add "ios.deploymentTarget": "${target}" to Podfile.properties.json manually. ${String(error)}`,
    );
  }
}
