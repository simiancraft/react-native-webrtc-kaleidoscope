import type { DangerousMod, ExpoConfig, ModConfig, ModRequest, PlatformMods } from './types';

/**
 * Register a platform "dangerous" mod by mutating `config.mods` DIRECTLY, instead
 * of @expo/config-plugins' `withDangerousMod` (which we cannot import at load time
 * on an EAS worker; see index.ts). This owns the subtle, load-bearing contract in
 * ONE place so the per-platform mods cannot drift from it:
 *   - initialize `config.mods` / `config.mods[platform]`,
 *   - CHAIN any previously registered dangerous mod (run it first, cooperate),
 *   - run `patch` with the resolved mod request,
 *   - return `result` (the chained mod's config), which is what Expo's dangerous
 *     base provider asserts on, NOT the original `config`.
 *
 * `patch` decides its own guards (which fields of the request it needs) and is
 * responsible for being non-fatal; the wrapper never throws on its behalf.
 */
export function registerDangerousPatch(
  config: ExpoConfig,
  platform: 'ios' | 'android',
  patch: (request: ModRequest) => void | Promise<void>,
): ExpoConfig {
  config.mods ??= {};
  const platformMods: PlatformMods = config.mods[platform] ?? {};
  config.mods[platform] = platformMods;
  const previous: DangerousMod | undefined = platformMods.dangerous;
  platformMods.dangerous = async (modConfig: ModConfig) => {
    const result = typeof previous === 'function' ? await previous(modConfig) : modConfig;
    await patch(result.modRequest ?? {});
    return result;
  };
  return config;
}
