// Expo config plugin entry. Expo's plugin resolver hardcodes this filename and
// loads it with require() from the file's REAL path. The implementation is
// TypeScript under plugin/src, compiled to the COMMITTED plugin/build (see
// plugin/src/index.ts for why it is committed and dependency-free at load time).
//
// Keep this a one-line CommonJS shim: do not add logic here, and do not point it
// at dist/ (which is gitignored and absent on EAS). Edit plugin/src and run
// `bun run build:plugin`.
module.exports = require('./plugin/build');
