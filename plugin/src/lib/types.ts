// Minimal structural shapes for the slice of the Expo prebuild config + ModConfig
// this plugin touches. We deliberately DON'T import these from
// @expo/config-plugins: the compiled plugin must LOAD on an EAS worker where
// @expo/config-plugins is not installed at app.plugin.js's realpath (see
// index.ts). A structural subset is enough for compile-time safety and keeps the
// load-time dependency surface at zero. @expo/config-plugins is still resolved at
// RUNTIME, lazily, from the consumer (ios-assets.ts) where it is installed.

/** The `modRequest` Expo's dangerous-mod runner threads into each mod. */
export type ModRequest = {
  readonly projectRoot?: string;
  readonly platformProjectRoot?: string;
};

/** The config object a dangerous mod receives and returns. */
export type ModConfig = {
  readonly modRequest?: ModRequest;
  [key: string]: unknown;
};

/** A platform dangerous mod: Expo calls it with a ModConfig, awaits the result. */
export type DangerousMod = (config: ModConfig) => ModConfig | Promise<ModConfig>;

export type PlatformMods = {
  dangerous?: DangerousMod;
  [key: string]: unknown;
};

/** The slice of the Expo app config the plugin mutates (config.mods.*). */
export type ExpoConfig = {
  mods?: {
    ios?: PlatformMods;
    android?: PlatformMods;
    [platform: string]: unknown;
  };
  [key: string]: unknown;
};
