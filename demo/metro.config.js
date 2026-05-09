// Metro config for the in-repo demo. Lets the demo resolve the workspace
// package react-native-webrtc-kaleidoscope from ../src directly (no need to
// publish a tarball or run a build between every change).

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

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

module.exports = config;
