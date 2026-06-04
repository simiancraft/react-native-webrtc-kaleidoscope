import fs from 'node:fs';
import path from 'node:path';
import { LOG_TAG } from '../lib/constants';

// Mirrors ios/Kaleidoscope.podspec :ios => '15.0'. Bumping the podspec requires
// bumping this constant; the drift cost is a silent pod-install drop (the bug
// this plugin fixes): expo-modules-autolinking drops any pod whose declared
// minimum platform exceeds the Podfile platform.
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
export function bumpDeploymentTarget(platformProjectRoot: string): void {
  const propsPath = path.join(platformProjectRoot, 'Podfile.properties.json');
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
    if (
      isVersionLessThan(typeof existing === 'string' ? existing : undefined, IOS_DEPLOYMENT_TARGET)
    ) {
      next['ios.deploymentTarget'] = IOS_DEPLOYMENT_TARGET;
    }
    fs.writeFileSync(propsPath, `${JSON.stringify(next, null, 2)}\n`);
  } catch (error) {
    console.warn(
      `${LOG_TAG} Could not patch ${propsPath} to raise iOS deployment target; add "ios.deploymentTarget": "${IOS_DEPLOYMENT_TARGET}" to Podfile.properties.json manually. ${String(error)}`,
    );
  }
}
