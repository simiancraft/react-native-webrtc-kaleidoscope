// The consumer's preset book. Every entry is a name -> { shader, options }: one
// flat radio bank of everything you can command. This is the file a consuming
// app owns and curates; the prebuild plugin (native) will parse it to copy only
// the referenced shader/image sources into the bundle. On web it is read at
// runtime by kaleidoscope().
//
// `as const satisfies PresetBook` gives per-preset option typing and rejects a
// wrong options shape for a shader at compile time.

import { Asset } from 'expo-asset';
import type { PresetBook } from 'react-native-webrtc-kaleidoscope';
// Library-shipped image presets; each resolves to a bundled WebP URL on web and
// to the preset name on native. The simiancraft presets lead (shop's demo).
import { darkOffice } from 'react-native-webrtc-kaleidoscope/backgrounds/dark-office';
import { debugResolutions } from 'react-native-webrtc-kaleidoscope/backgrounds/debug-resolutions';
import { homeDark } from 'react-native-webrtc-kaleidoscope/backgrounds/home-dark';
import { homeLight } from 'react-native-webrtc-kaleidoscope/backgrounds/home-light';
import { lightOffice } from 'react-native-webrtc-kaleidoscope/backgrounds/light-office';
import { natureDark } from 'react-native-webrtc-kaleidoscope/backgrounds/nature-dark';
import { natureLight } from 'react-native-webrtc-kaleidoscope/backgrounds/nature-light';
import { simiancraftDark } from 'react-native-webrtc-kaleidoscope/backgrounds/simiancraft-dark';
import { simiancraftLight } from 'react-native-webrtc-kaleidoscope/backgrounds/simiancraft-light';
import { stylizedDark } from 'react-native-webrtc-kaleidoscope/backgrounds/stylized-dark';
import { stylizedLight } from 'react-native-webrtc-kaleidoscope/backgrounds/stylized-light';

export const presets = {
  // Background images: one background-image shader, many sources.
  'simiancraft-light': { shader: 'background-image', options: { source: simiancraftLight } },
  'simiancraft-dark': { shader: 'background-image', options: { source: simiancraftDark } },
  // A demo-owned image (NOT part of the package), proving a consumer can add
  // their own background. On web, Asset.fromModule(require(...)).uri is the URL;
  // the prebuild plugin reads the require specifier to copy it into the native
  // bundle as wolf-cave.webp.
  'wolf-cave': {
    shader: 'background-image',
    options: { source: Asset.fromModule(require('./assets/backgrounds/wolf-cave.webp')).uri },
  },
  'debug-resolutions': { shader: 'background-image', options: { source: debugResolutions } },
  'dark-office': { shader: 'background-image', options: { source: darkOffice } },
  'light-office': { shader: 'background-image', options: { source: lightOffice } },
  'home-light': { shader: 'background-image', options: { source: homeLight } },
  'home-dark': { shader: 'background-image', options: { source: homeDark } },
  'nature-light': { shader: 'background-image', options: { source: natureLight } },
  'nature-dark': { shader: 'background-image', options: { source: natureDark } },
  'stylized-light': { shader: 'background-image', options: { source: stylizedLight } },
  'stylized-dark': { shader: 'background-image', options: { source: stylizedDark } },

  // Blur: one blur shader, three sigmas.
  'blur-low': { shader: 'blur', options: { sigma: 1.5 } },
  'blur-medium': { shader: 'blur', options: { sigma: 4 } },
  'blur-high': { shader: 'blur', options: { sigma: 7 } },

  // Plasma: one plasma.frag, many uniform bundles. (Options map to u-prefixed
  // uniforms by convention; the book supplies the full set, no implicit defaults.)
  'plasma-ocean': { shader: 'plasma', options: { colorA: [0.0, 0.3, 0.6], colorB: [0.0, 0.6, 0.6], speed: 0.3, scale: 8 } },
  'plasma-sunset': { shader: 'plasma', options: { colorA: [0.9, 0.3, 0.1], colorB: [0.8, 0.1, 0.5], speed: 0.3, scale: 8 } },
  'plasma-mint': { shader: 'plasma', options: { colorA: [0.1, 0.5, 0.3], colorB: [0.6, 0.9, 0.5], speed: 0.25, scale: 8 } },
  'plasma-fast': { shader: 'plasma', options: { colorA: [0.9, 0.3, 0.1], colorB: [0.8, 0.1, 0.5], speed: 0.9, scale: 10 } },
  // Transforms are NOT book presets: they're driven by the transform() verb
  // (flip/rotate), not curated art. The book is the art catalog only.
} as const satisfies PresetBook;

export type PresetId = keyof typeof presets;
