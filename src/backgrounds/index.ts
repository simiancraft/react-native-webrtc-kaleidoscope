// Barrel for the backgrounds feature. Importing this pulls every preset's
// loader (and thus every bundled WebP) into the consumer's bundle; for a
// frugal bundle, import a single preset directly, e.g.
// `react-native-webrtc-kaleidoscope/backgrounds/office-1`.

export { office1 } from './office-1';
export { office2 } from './office-2';
export type { BackgroundPresetName } from './presets';
export { BACKGROUND_PRESETS } from './presets';
