import fs from 'node:fs';
import path from 'node:path';
import { LOG_TAG } from '../lib/constants';

// The Kaleidoscope POD's own iOS floor; mirrors ios/Kaleidoscope.podspec
// :ios => '15.0'. Bumping the podspec requires bumping this constant. It is
// reconciled against the HOST RN's floor at write time (see bumpDeploymentTarget):
// the pod floor is only forced when it EXCEEDS the floor the generated Podfile
// already defaults to, because expo-modules-autolinking drops any pod whose
// declared minimum platform exceeds the Podfile platform. It is never written
// BELOW the Podfile's own default, which would lower RN's floor and fail pod
// install on RN's core pods (issue #86: RN >= 0.81's floor 15.1 exceeds this).
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
 * The iOS deployment-target FLOOR the generated Podfile falls back to when
 * `ios.deploymentTarget` is unset. Expo/RN prebuild bakes the host RN's own floor
 * (`min_ios_version_supported`) into the Podfile's platform line as a literal,
 * e.g. `platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1'` (or a
 * bare `platform :ios, '15.1'`). That literal is exactly the value the Podfile
 * uses when we leave the props key alone, so it is the floor we must not drop
 * below. Returns the dotted version, or undefined if the Podfile is absent,
 * unreadable, or states its fallback as a non-literal (a Ruby call) we cannot read
 * statically; the caller then conservatively forces the pod floor (prior behavior).
 *
 * The Podfile, already on disk at mod-execution time, is preferred over reaching
 * into react-native's Ruby helper: no dependency to resolve, no coupling to RN's
 * internal file layout or `exports` map, and it reflects any consumer Podfile
 * override too.
 */
function readPodfileIosFloor(platformProjectRoot: string): string | undefined {
  try {
    const podfile = fs.readFileSync(path.join(platformProjectRoot, 'Podfile'), 'utf8');
    const platformLine = podfile.match(/^[ \t]*platform[ \t]+:ios\b.*$/m)?.[0];
    if (!platformLine) return undefined;
    // The only dotted-numeric quoted token on the platform line is the floor
    // literal; `'ios.deploymentTarget'` is non-numeric. Take the last match so a
    // bare `platform :ios, 'X.Y'` and the `|| 'X.Y'` fallback form both resolve.
    const versions = platformLine.match(/['"]\d+\.\d+(?:\.\d+)?['"]/g);
    const last = versions?.[versions.length - 1];
    return last ? last.replace(/['"]/g, '') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reconcile `ios.deploymentTarget` in Podfile.properties.json so the Kaleidoscope
 * pod is not dropped by expo-modules-autolinking (which drops any pod whose
 * declared minimum platform exceeds the Podfile platform), WITHOUT ever lowering
 * the host RN's own floor. The generated Podfile reads
 * `podfile_properties['ios.deploymentTarget']` at the top, so this props key is the
 * canonical, no-Podfile-edit override seam.
 *
 * Given the pod floor (IOS_DEPLOYMENT_TARGET) and the Podfile's own fallback floor
 * (readPodfileIosFloor, i.e. the host RN's floor):
 *   - key set >= pod floor: leave it (never downgrade).
 *   - key set < pod floor: raise it to the pod floor.
 *   - key unset, Podfile floor already >= pod floor: DEFER (leave unset). The
 *     Podfile's `|| <floor>` already satisfies the pod, so writing the lower pod
 *     floor would clobber it and break pod install on RN's core pods (issue #86).
 *     Deferring also auto-tracks future RN floor bumps with no code change.
 *   - key unset, Podfile floor below or unknown: force the pod floor (prior
 *     behavior, e.g. RN 0.74's 13.4 < 15.0).
 * Idempotent, non-fatal (warn, never throw).
 *
 * Reads the props file by hand (not readTextOrNull) because it must DISTINGUISH a
 * missing file (treat as `{}`) from an unreadable one (bail without clobbering);
 * a distinction readTextOrNull deliberately flattens.
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
    const existingRaw = next['ios.deploymentTarget'];
    const existing = typeof existingRaw === 'string' ? existingRaw : undefined;
    if (existing === undefined) {
      // Unset: the Podfile resolves `|| <floor literal>`, which tracks the host
      // RN's own iOS floor. Only force the pod floor when that fallback floor is
      // below it (or unreadable); otherwise defer so we never lower RN's floor.
      // `isVersionLessThan(undefined, ...)` is true, so an unreadable Podfile floor
      // falls back to forcing the pod floor (prior behavior).
      const podfileFloor = readPodfileIosFloor(platformProjectRoot);
      if (isVersionLessThan(podfileFloor, IOS_DEPLOYMENT_TARGET)) {
        next['ios.deploymentTarget'] = IOS_DEPLOYMENT_TARGET;
      }
    } else if (isVersionLessThan(existing, IOS_DEPLOYMENT_TARGET)) {
      // Explicit value below the pod floor: raise it. At or above: leave it.
      next['ios.deploymentTarget'] = IOS_DEPLOYMENT_TARGET;
    }
    fs.writeFileSync(propsPath, `${JSON.stringify(next, null, 2)}\n`);
  } catch (error) {
    console.warn(
      `${LOG_TAG} Could not patch ${propsPath} to raise iOS deployment target; add "ios.deploymentTarget": "${IOS_DEPLOYMENT_TARGET}" to Podfile.properties.json manually. ${String(error)}`,
    );
  }
}
