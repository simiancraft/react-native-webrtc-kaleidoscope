// Expo config plugin (the prebuild precompiler) for react-native-webrtc-kaleidoscope.
//
// This is the TypeScript SOURCE. It is compiled offline to plugin/build/ (real
// node16 CommonJS) by `bun run build:plugin`, and that compiled output is
// COMMITTED to git. The repo-root app.plugin.js is a one-line shim that does
// `module.exports = require('./plugin/build')`; Expo's plugin resolver loads it
// with require() and unwraps the default export.
//
// WHY a committed compiled plugin, and why it touches nothing but Node builtins
// at load time:
//   Expo's plugin resolver hardcodes the entry filename to `app.plugin.js` and
//   loads it with require() from the file's REAL path. The demo consumes this
//   library via `file:..`, so on EAS the realpath is the repo root, where neither
//   the library's node_modules NOR its (gitignored) dist/ is present. A committed
//   plugin/build/ is the only output guaranteed to exist at that realpath. For the
//   same reason, the patches register their mods by mutating `config.mods.<plat>`
//   directly instead of importing `withDangerousMod` from @expo/config-plugins,
//   and @expo/config-plugins is require()'d only LAZILY, resolved from the
//   CONSUMER's node_modules at mod-execution time (see ios-assets.ts), where it is
//   installed. The result loads identically from a published tarball, the
//   symlinked demo, and the EAS worker.
//
// The native frame-processor registration itself happens via the Expo Module's
// OnCreate hook (KaleidoscopeModule.{kt,swift}), not here. This plugin's job is
// the iOS Podfile / deployment-target patches and the curated asset copy.

import { withKaleidoscopeAndroid } from './android';
import { withKaleidoscopeIos } from './ios';
import type { ExpoConfig } from './lib/types';

const withKaleidoscope = (config: ExpoConfig): ExpoConfig =>
  withKaleidoscopeIos(withKaleidoscopeAndroid(config));

export default withKaleidoscope;
