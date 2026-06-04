import { LOG_TAG } from '../lib/constants';
import { registerDangerousPatch } from '../lib/mods';
import type { ExpoConfig } from '../lib/types';
import { copyAndroidAssets } from './assets';

/**
 * Android prebuild patch: copy every referenced image plate + composite
 * thumbnail into the app bundle. Registered as a chained dangerous mod (see
 * registerDangerousPatch). Non-fatal.
 */
export function withKaleidoscopeAndroid(config: ExpoConfig): ExpoConfig {
  return registerDangerousPatch(config, 'android', ({ projectRoot, platformProjectRoot }) => {
    if (!(projectRoot && platformProjectRoot)) return;
    try {
      copyAndroidAssets(projectRoot, platformProjectRoot);
    } catch (error) {
      console.warn(
        `${LOG_TAG} Could not copy resources into the Android bundle; bundled images/thumbnails may be missing at runtime. ${String(error)}`,
      );
    }
  });
}
