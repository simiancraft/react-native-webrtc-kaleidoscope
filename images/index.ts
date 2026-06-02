// Barrel for the images feature: the platform-agnostic preset catalog. Preset
// *sources* are not re-exported here; import them per preset so each pulls only
// its own WebP, e.g.
// `import { darkOffice } from 'react-native-webrtc-kaleidoscope/images/dark-office'`.

export type { BackgroundPresetName } from './presets';
export { BACKGROUND_PRESETS } from './presets';
