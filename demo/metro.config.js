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

// Resolve subpath imports through the library's package.json `exports` map.
// The library ships three folder-per-item root folders (images/, composites/,
// shaders/) whose `pkg/<folder>/<name>` paths would otherwise be classically
// resolved as bare directories (no index), which on Metro's default exports-off
// path shadows the `exports` map for the WHOLE package and breaks export-only
// subpaths like `./nativewind`. Honoring exports resolves each subpath to its
// declared target. Metro defaults this off in SDK 51; consumers of this library
// enable it (documented in the README).
config.resolver.unstable_enablePackageExports = true;

// NativeWind: process global.css and enable className across the app.
const nwConfig = withNativeWind(config, { input: './global.css' });

// The local dev tree carries react / react-native in BOTH the demo and the
// workspace-root node_modules (the lib's dev deps), so force just those to the
// demo's single copy or two React instances throw "null useState" on the first
// hook. NativeWind and its react-native-css-interop runtime are deliberately NOT
// forced: NativeWind's own Metro resolver resolves its jsx-runtime relative to
// the importing file, and overriding the origin breaks that on EAS (the
// `react-native-css-interop/jsx-runtime` "unable to resolve module" build
// failure). They dedupe to a single copy on their own.
const FORCE_SINGLE = ['react', 'react-dom', 'react-native'];
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
