// The consumer's preset book. Every entry is a name -> Composite: an ordered
// painter's stack of layers, plus a readable `name` and a `category` (the
// picker's grouping axis). This is the file a consuming app owns and curates;
// the prebuild plugin (native) parses it to copy only the referenced
// image/shader sources into the bundle. On web it is read at runtime by
// kaleidoscope().
//
// The packaged "Worlds" and "Sky" composites are imported from the library
// (`react-native-webrtc-kaleidoscope/composites/<name>`); the book lists them by
// spreading them in. The simpler Backgrounds, Blur, and Plasma category entries
// stay inline as the demo's curated examples and the consumer-authoring pattern:
// each references a library image (`.../images/<name>`) or a library shader by
// name. `wolf-cave` is a demo-OWNED image (not in the package), proving a
// consumer can add their own background.
//
// Layer ids are unique WITHIN one composite. An `image` layer's id doubles as
// its native plate id (the bundled WebP basename), so image layers keep their
// plate-basename id; every other layer gets a simple unique-per-preset id.
//
// `as const satisfies PresetBook` gives per-layer typing and rejects a wrong
// layer shape at compile time.

import { Asset } from 'expo-asset';
import type { PresetBook } from 'react-native-webrtc-kaleidoscope';
// Packaged composites (the "Worlds" and "Sky" scenes), shipped by the library.
import { clouds } from 'react-native-webrtc-kaleidoscope/composites/clouds';
import { corporateBlobs } from 'react-native-webrtc-kaleidoscope/composites/corporate-blobs';
import { fairyCave } from 'react-native-webrtc-kaleidoscope/composites/fairy-cave';
import { nebula } from 'react-native-webrtc-kaleidoscope/composites/nebula';
import { observationDeck } from 'react-native-webrtc-kaleidoscope/composites/observation-deck';
import { simianlights } from 'react-native-webrtc-kaleidoscope/composites/simianlights';
import { underwater } from 'react-native-webrtc-kaleidoscope/composites/underwater';
import { wizardTower } from 'react-native-webrtc-kaleidoscope/composites/wizard-tower';
// Library-shipped image presets; each resolves to a bundled WebP URL on web and
// to the preset name on native. The simiancraft presets lead (shop's demo).
import { darkOffice } from 'react-native-webrtc-kaleidoscope/images/dark-office';
import { debugResolutions } from 'react-native-webrtc-kaleidoscope/images/debug-resolutions';
import { homeDark } from 'react-native-webrtc-kaleidoscope/images/home-dark';
import { homeLight } from 'react-native-webrtc-kaleidoscope/images/home-light';
import { lightOffice } from 'react-native-webrtc-kaleidoscope/images/light-office';
import { natureDark } from 'react-native-webrtc-kaleidoscope/images/nature-dark';
import { natureLight } from 'react-native-webrtc-kaleidoscope/images/nature-light';
import { simiancraftDark } from 'react-native-webrtc-kaleidoscope/images/simiancraft-dark';
import { simiancraftLight } from 'react-native-webrtc-kaleidoscope/images/simiancraft-light';
import { stylizedDark } from 'react-native-webrtc-kaleidoscope/images/stylized-dark';
import { stylizedLight } from 'react-native-webrtc-kaleidoscope/images/stylized-light';

const wolfCave = Asset.fromModule(require('./assets/backgrounds/wolf-cave.webp')).uri;

export const presets = {
  // --- Worlds: composed scenes (shown FIRST), imported from the library. ---
  'wizard-tower': wizardTower,
  'observation-deck': observationDeck,
  'fairy-cave': fairyCave,
  underwater,
  nebula,
  simianlights,
  'corporate-blobs': corporateBlobs,

  // --- Sky: raymarched clouds with you composited over them. ---
  clouds,

  // --- Plasma: a generative plasma field with you composited over it. The old
  // single plasma shader composited the person over its output; the same shape
  // as a one-generative-layer-plus-subject composite. ---
  'plasma-ocean': {
    name: 'Ocean',
    category: 'Plasma',
    layers: [
      {
        id: 'plasma',
        shader: 'plasma',
        uniforms: { uColorA: [0.0, 0.3, 0.6], uColorB: [0.0, 0.6, 0.6], uSpeed: 0.3, uScale: 8 },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'plasma-sunset': {
    name: 'Sunset',
    category: 'Plasma',
    layers: [
      {
        id: 'plasma',
        shader: 'plasma',
        uniforms: { uColorA: [0.9, 0.3, 0.1], uColorB: [0.8, 0.1, 0.5], uSpeed: 0.3, uScale: 8 },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'plasma-mint': {
    name: 'Mint',
    category: 'Plasma',
    layers: [
      {
        id: 'plasma',
        shader: 'plasma',
        uniforms: { uColorA: [0.1, 0.5, 0.3], uColorB: [0.6, 0.9, 0.5], uSpeed: 0.25, uScale: 8 },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'plasma-fast': {
    name: 'Fast',
    category: 'Plasma',
    layers: [
      {
        id: 'plasma',
        shader: 'plasma',
        uniforms: { uColorA: [0.9, 0.3, 0.1], uColorB: [0.8, 0.1, 0.5], uSpeed: 0.9, uScale: 10 },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // --- Blur: a camera-sampling blur on the background, you sharp on top. ---
  'blur-low': {
    name: 'Low',
    category: 'Blur',
    layers: [
      { id: 'blur', shader: 'blur', target: 'background', uniforms: { sigma: 1.5 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'blur-medium': {
    name: 'Medium',
    category: 'Blur',
    layers: [
      { id: 'blur', shader: 'blur', target: 'background', uniforms: { sigma: 4 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'blur-high': {
    name: 'High',
    category: 'Blur',
    layers: [
      { id: 'blur', shader: 'blur', target: 'background', uniforms: { sigma: 7 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // --- Backgrounds: one image layer (cover-fit). The id is the plate basename;
  // the thumbnail is the same image source. ---
  'simiancraft-light': {
    name: 'Simiancraft Light',
    category: 'Backgrounds',
    thumbnail: simiancraftLight,
    layers: [{ id: 'simiancraft-light', shader: 'image', source: simiancraftLight }],
  },
  'simiancraft-dark': {
    name: 'Simiancraft Dark',
    category: 'Backgrounds',
    thumbnail: simiancraftDark,
    layers: [{ id: 'simiancraft-dark', shader: 'image', source: simiancraftDark }],
  },
  // A demo-owned image (NOT part of the package), proving a consumer can add
  // their own background. The prebuild plugin reads the require specifier to copy
  // it into the native bundle as wolf-cave.webp.
  'wolf-cave': {
    name: 'Wolf Cave',
    category: 'Backgrounds',
    thumbnail: wolfCave,
    layers: [{ id: 'wolf-cave', shader: 'image', source: wolfCave }],
  },
  'debug-resolutions': {
    name: 'Debug Resolutions',
    category: 'Backgrounds',
    thumbnail: debugResolutions,
    layers: [{ id: 'debug-resolutions', shader: 'image', source: debugResolutions }],
  },
  'dark-office': {
    name: 'Dark Office',
    category: 'Backgrounds',
    thumbnail: darkOffice,
    layers: [{ id: 'dark-office', shader: 'image', source: darkOffice }],
  },
  'light-office': {
    name: 'Light Office',
    category: 'Backgrounds',
    thumbnail: lightOffice,
    layers: [{ id: 'light-office', shader: 'image', source: lightOffice }],
  },
  'home-light': {
    name: 'Home Light',
    category: 'Backgrounds',
    thumbnail: homeLight,
    layers: [{ id: 'home-light', shader: 'image', source: homeLight }],
  },
  'home-dark': {
    name: 'Home Dark',
    category: 'Backgrounds',
    thumbnail: homeDark,
    layers: [{ id: 'home-dark', shader: 'image', source: homeDark }],
  },
  'nature-light': {
    name: 'Nature Light',
    category: 'Backgrounds',
    thumbnail: natureLight,
    layers: [{ id: 'nature-light', shader: 'image', source: natureLight }],
  },
  'nature-dark': {
    name: 'Nature Dark',
    category: 'Backgrounds',
    thumbnail: natureDark,
    layers: [{ id: 'nature-dark', shader: 'image', source: natureDark }],
  },
  'stylized-light': {
    name: 'Stylized Light',
    category: 'Backgrounds',
    thumbnail: stylizedLight,
    layers: [{ id: 'stylized-light', shader: 'image', source: stylizedLight }],
  },
  'stylized-dark': {
    name: 'Stylized Dark',
    category: 'Backgrounds',
    thumbnail: stylizedDark,
    layers: [{ id: 'stylized-dark', shader: 'image', source: stylizedDark }],
  },

  // Transforms are NOT book presets: they're driven by the transform() verb
  // (flip/rotate), not curated art. The book is the art catalog only.
} as const satisfies PresetBook;

export type PresetId = keyof typeof presets;
