// Metro config for the in-repo demo. Lets the demo resolve the workspace
// package react-native-webrtc-kaleidoscope from ../src directly (no need to
// publish a tarball or run a build between every change).

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the parent workspace so changes in ../src trigger Metro reloads.
config.watchFolders = [workspaceRoot];

// Resolve modules from both the demo and the workspace root. Prefer the
// demo's node_modules first so React / RN versions stay deduped to the
// demo's lockfile.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force a single React copy across the workspace and demo. Without this,
// hooks throw "Invalid hook call" when the demo's React and the package's
// React are different instances during Metro's dev server.
config.resolver.disableHierarchicalLookup = false;

// NativeWind: process global.css and enable className across the app.
const nwConfig = withNativeWind(config, { input: './global.css' });

// The library ships React components consumed here, and it carries its own dev
// copies of react / react-native / nativewind. Force those (plus the css-interop
// runtime) to resolve to the demo's single copy: two React instances throw
// "null useState" on the first hook, and a duplicate nativewind instance means
// cssInterop registrations land on a different module than the one that renders.
const FORCE_SINGLE = ['react', 'react-dom', 'react-native', 'nativewind', 'react-native-css-interop'];
const upstreamResolveRequest = nwConfig.resolver.resolveRequest;
nwConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  const forced = FORCE_SINGLE.some((p) => moduleName === p || moduleName.startsWith(`${p}/`));
  const ctx = forced
    ? { ...context, originModulePath: path.join(projectRoot, 'index.js') }
    : context;
  return resolve(ctx, moduleName, platform);
};

module.exports = nwConfig;
