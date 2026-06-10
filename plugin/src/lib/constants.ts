// Self-contained on purpose: this plugin must not import from the library's
// src/ (which Metro compiles for the app), because the plugin compiles to its
// own committed plugin/build and loads on an EAS worker with no library dist.

/** Prefix on every log/warn line the prebuild plugin emits. */
export const LOG_TAG = '[*ੈ✩‧₊˚  react-native-webrtc-kaleidoscope *ੈ✩‧₊˚]';
