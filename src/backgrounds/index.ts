// Barrel for the backgrounds feature: the platform-agnostic preset catalog.
// Preset *sources* are not re-exported here; import them per preset so each
// pulls only its own WebP, e.g.
// `import { office1 } from 'react-native-webrtc-kaleidoscope/backgrounds/office-1'`.

export type { BackgroundPresetName } from './presets';
export { BACKGROUND_PRESETS } from './presets';
