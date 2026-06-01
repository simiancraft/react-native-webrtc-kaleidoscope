// The consumer's preset book. Every entry is a name -> Composite: an ordered
// painter's stack of layers, plus a readable `name` and a `category` (the
// picker's grouping axis). This is the file a consuming app owns and curates;
// the prebuild plugin (native) parses it to copy only the referenced
// image/shader sources into the bundle. On web it is read at runtime by
// kaleidoscope().
//
// Layer ids are unique WITHIN one composite. An `image` layer's id doubles as
// its native plate id (the bundled WebP basename), so image layers keep their
// plate-basename id; every other layer gets a simple unique-per-preset id.
//
// `as const satisfies PresetBook` gives per-layer typing and rejects a wrong
// layer shape at compile time.

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

const wolfCave = Asset.fromModule(require('./assets/backgrounds/wolf-cave.webp')).uri;
const wizardsTower = Asset.fromModule(require('./assets/backgrounds/wizards-tower.webp')).uri;
const observationDeck = Asset.fromModule(require('./assets/backgrounds/observation-deck.webp')).uri;
const fairyTreehouse = Asset.fromModule(require('./assets/backgrounds/fairy-treehouse.webp')).uri;

export const presets = {
  // --- Worlds: composed scenes (shown FIRST). An ordered painter's stack run as
  // one effect by the layered compositor. ---

  // Wizard tower: sunset clouds visible through the chamber's cut-out sky, the
  // tower plate composited on top.
  'wizard-tower': {
    name: 'Wizard Tower',
    category: 'Worlds',
    layers: [
      {
        id: 'sky',
        shader: 'clouds',
        uniforms: {
          uSkyLowColor: [0.99, 0.62, 0.03],
          uSkyHighColor: [0.13, 0.3, 0.84],
          uCloudLightColor: [0.98, 0.87, 0.53],
          uCloudDarkColor: [0.98, 0.57, 0.16],
          uExposure: 1.26,
          uStepSize: 0.32,
          uCloudSpeed: 0.92,
          uCloudScale: 0.77,
          uDensity: 0.185,
          uCoverage: 0.55,
          uSoftness: 0.23,
        },
      },
      { id: 'wizards-tower', shader: 'image', source: wizardsTower },
      // You, standing in the chamber.
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // Space observation deck: a simianlights field seen through the deck's
  // panoramic window (a cut-out plate), you standing in the room, an anamorphic
  // lens flare across the glass. Back-to-front: simianlights, deck plate, you,
  // flare. The full "space scene".
  'observation-deck': {
    name: 'Observation Deck',
    category: 'Worlds',
    layers: [
      {
        id: 'field',
        shader: 'simianlights',
        uniforms: {
          uColor: [0.27, 0.44, 0.17],
          uBrightness: 1.7,
          uSpeed: 2.66,
          uTwinkleSpeed: 0.36,
          uScale: 2.85,
          uStarGlow: 1.56,
        },
      },
      // The deck interior; the window is cut out so the field shows through.
      { id: 'observation-deck', shader: 'image', source: observationDeck },
      // You, standing at the window.
      { id: 'you', shader: 'direct', target: 'subject' },
      // Lens flare across the glass, on top of everything. Magenta/pink tint
      // against the green field, ghosts cranked up. Additive.
      {
        id: 'flare',
        shader: 'anamorphic-lensflare',
        blend: 'additive',
        uniforms: {
          uFlareX: 0.33,
          uFlareY: 0.64,
          uIntensity: 0.44,
          uStreakLength: 0.41,
          uStreakWidth: 165,
          uGhostStrength: 1.5,
          uWarmColor: [0.88, 0.28, 0.52],
          uBlueColor: [0.96, 0.37, 0.81],
          uPinkColor: [0.91, 0.14, 0.63],
        },
      },
    ],
  },

  // Fairy cave: a moonlit night sky through the round opening, the cave plate,
  // and fireflies drifting on top.
  'fairy-cave': {
    name: 'Fairy Cave',
    category: 'Worlds',
    layers: [
      {
        id: 'sky',
        shader: 'clouds',
        uniforms: {
          uSkyLowColor: [0.05, 0.01, 0.04],
          uSkyHighColor: [0.02, 0.02, 0.04],
          uCloudLightColor: [0.72, 0.39, 0.1],
          uCloudDarkColor: [0.18, 0.14, 0.07],
          uExposure: 0.93,
          uStepSize: 0.38,
          uCloudSpeed: 0.37,
          uCloudScale: 1.26,
          uDensity: 0.035,
          uCoverage: 0.44,
          uSoftness: 0.18,
        },
      },
      { id: 'fairy-treehouse', shader: 'image', source: fairyTreehouse },
      {
        id: 'fireflies',
        shader: 'fireflies',
        blend: 'additive',
        uniforms: { uGlowSize: 0.025, uDotSize: 0.004, uSpeed: 0.18, uTwinkle: 1.6 },
      },
      // You, in the cave (fireflies drifting behind you).
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // Underwater: the underwater plate with animated god rays additively on top,
  // the ray tint color-matched to the scene's cool light.
  underwater: {
    name: 'Underwater',
    category: 'Worlds',
    layers: [
      { id: 'stylized-dark', shader: 'image', source: stylizedDark },
      {
        id: 'rays',
        shader: 'godrays',
        blend: 'additive',
        uniforms: {
          uLightColor: [1, 1, 1],
          uRayCount: 11,
          uRaySpeed: 0.55,
          uRayIntensity: 1.2,
          uRaySoftness: 2.6,
          uTopGlow: 0.5,
          uFadeDistance: 0.75,
          uWobbleAmount: 0.08,
          uWobbleSpeed: 0.7,
        },
      },
      // The masked camera person, on top (god rays behind them). 'direct' on the
      // subject target = a passthrough of the segmented person.
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // Deep space: the procedural nebula as a full-frame backdrop, you composited
  // over it.
  nebula: {
    name: 'Nebula',
    category: 'Worlds',
    layers: [
      {
        id: 'nebula',
        shader: 'nebula',
        uniforms: {
          uColor: [0.53, 0.55, 0.84],
          uBrightness: 0.87,
          uSpeed: 0.22,
          uTwinkleSpeed: 1.94,
          uScale: 0.88,
          uStarGlow: 0.38,
        },
      },
      // You, drifting in the field.
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // Simianlights: the nebula's calmer sibling (sparser, larger glowing orbs) as
  // a standalone space backdrop, you composited over it.
  simianlights: {
    name: 'Simianlights',
    category: 'Worlds',
    layers: [
      {
        id: 'field',
        shader: 'simianlights',
        uniforms: {
          uColor: [0.8, 0.56, 0.42],
          uBrightness: 0.42,
          uSpeed: 3,
          uTwinkleSpeed: 3,
          uScale: 0.98,
          uStarGlow: 0.87,
        },
      },
      // You, drifting in the field.
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // Corporate blobs: a dark-office backdrop, you composited over it, and large
  // decorative edge/vignette blobs framing the frame on top (normal blend; the
  // center stays clear so you read through). Each blob's color is its own
  // uniform, so the eight-color brand palette is fully tunable; uColor grades
  // them all together.
  'corporate-blobs': {
    name: 'Corporate Blobs',
    category: 'Worlds',
    layers: [
      { id: 'dark-office', shader: 'image', source: darkOffice },
      // You, in the office (blobs frame you from the edges, on top).
      { id: 'you', shader: 'direct', target: 'subject' },
      {
        id: 'blobs',
        shader: 'corporate-blobs',
        blend: 'normal',
        uniforms: {
          uColor: [1, 1, 1],
          uBlobColor1: [0.376, 0.647, 0.98],
          uBlobColor2: [0.063, 0.725, 0.506],
          uBlobColor3: [0.984, 0.749, 0.141],
          uBlobColor4: [0.976, 0.451, 0.086],
          uBlobColor5: [0.133, 0.773, 0.369],
          uBlobColor6: [0.851, 0.275, 0.937],
          uBlobColor7: [0.341, 0.325, 0.306],
          uBlobColor8: [0.008, 0.518, 0.78],
          uGlobalAlpha: 0.58,
          uScale: 2.55,
          uEdgePull: 0.32,
          uCenterClear: 0.42,
          uMotionAmount: 1,
          uMotionSpeed: 1,
          uEdgeSoftness: 0.024,
        },
      },
    ],
  },

  // --- Sky: raymarched clouds with you composited over them. ---
  clouds: {
    name: 'Daytime',
    category: 'Sky',
    layers: [
      {
        id: 'sky',
        shader: 'clouds',
        uniforms: {
          uSkyLowColor: [0.09, 0.63, 0.95],
          uSkyHighColor: [0.04, 0.03, 0.86],
          uCloudLightColor: [1.0, 0.91, 0.77],
          uCloudDarkColor: [0.3, 0.3, 0.5],
          uExposure: 1.18,
          uStepSize: 0.16,
          uCloudSpeed: 0.16,
          uCloudScale: 1.08,
          uDensity: 0.235,
          uCoverage: 0.42,
          uSoftness: 0.39,
        },
      },
      // You, under the sky.
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

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
