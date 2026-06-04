import fs from 'node:fs';
import path from 'node:path';
import { LOG_TAG } from '../lib/constants';
import { registerDangerousPatch } from '../lib/mods';
import type { ExpoConfig } from '../lib/types';
import { copyIosAssets } from './assets';
import { bumpDeploymentTarget } from './deployment-target';
import { patchPodfile, resolveWebrtcPod } from './pods';

/**
 * iOS prebuild patches, registered as a chained dangerous mod (see
 * registerDangerousPatch). All idempotent and non-fatal:
 *   1. declare react-native-webrtc with `:modular_headers => true` in the Podfile,
 *   2. raise ios.deploymentTarget so autolinking doesn't drop the pod,
 *   3. copy every referenced image plate + composite thumbnail into the app target.
 */
export function withKaleidoscopeIos(config: ExpoConfig): ExpoConfig {
  return registerDangerousPatch(config, 'ios', ({ projectRoot, platformProjectRoot }) => {
    const pod = resolveWebrtcPod(projectRoot);
    if (platformProjectRoot && pod) {
      // Read and write are guarded together: a failure of either falls back to a
      // logged manual instruction rather than throwing out of prebuild.
      const podfilePath = path.join(platformProjectRoot, 'Podfile');
      try {
        const original = fs.readFileSync(podfilePath, 'utf8');
        const patched = patchPodfile(original, pod);
        if (patched !== original) fs.writeFileSync(podfilePath, patched);
      } catch (error) {
        const manualLine = `pod '${pod.podName}', :path => '../node_modules/${pod.packageDir}', :modular_headers => true`;
        console.warn(
          `${LOG_TAG} Could not patch the Podfile to build ${pod.podName} with modular headers; add "${manualLine}" inside your app target manually. ${String(error)}`,
        );
      }
    }

    if (platformProjectRoot) bumpDeploymentTarget(platformProjectRoot);

    if (projectRoot && platformProjectRoot) {
      try {
        copyIosAssets(projectRoot, platformProjectRoot);
      } catch (error) {
        console.warn(
          `${LOG_TAG} Could not bundle resources into the iOS app target; bundled images/thumbnails may be missing at runtime. ${String(error)}`,
        );
      }
    }
  });
}
