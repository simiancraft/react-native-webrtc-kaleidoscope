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
  // NOTE: the scene-base plates (wizards-tower, fairy-treehouse, bridge) are NOT
  // background-image presets. They are cut-out foregrounds owned by their scenes
  // (wizard-tower, fairy-cave, bridge below), composited over a procedural layer.
  // Listing them here as flat backgrounds would show them with their windows
  // un-filled, so they live only inside their scenes.
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

  // Composed scenes: an ordered painter's stack of layers, run as one effect by
  // the layered compositor (its own picker tab).

  // Wizard tower: sunset clouds visible through the chamber's cut-out sky, the
  // tower plate composited on top.
  'wizard-tower': {
    shader: 'scene',
    layers: [
      {
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
      { shader: 'image', source: Asset.fromModule(require('./assets/backgrounds/wizards-tower.webp')).uri },
      // You, standing in the chamber.
      { shader: 'direct', target: 'subject' },
    ],
  },

  // Space observation deck: a simianlights field seen through the deck's
  // panoramic window (a cut-out plate), you standing in the room, an anamorphic
  // lens flare across the glass. Back-to-front: simianlights, deck plate, you,
  // flare. The full "space scene".
  'observation-deck': {
    shader: 'scene',
    layers: [
      {
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
      { shader: 'image', source: Asset.fromModule(require('./assets/backgrounds/observation-deck.webp')).uri },
      // You, standing at the window.
      { shader: 'direct', target: 'subject' },
      // Lens flare across the glass, on top of everything. Magenta/pink tint
      // against the green field, ghosts cranked up. Additive.
      {
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
    shader: 'scene',
    layers: [
      {
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
      { shader: 'image', source: Asset.fromModule(require('./assets/backgrounds/fairy-treehouse.webp')).uri },
      {
        shader: 'fireflies',
        blend: 'additive',
        uniforms: { uGlowSize: 0.025, uDotSize: 0.004, uSpeed: 0.18, uTwinkle: 1.6 },
      },
      // You, in the cave (fireflies drifting behind you).
      { shader: 'direct', target: 'subject' },
    ],
  },

  // Underwater: the underwater plate with animated god rays additively on top,
  // the ray tint color-matched to the scene's cool light.
  underwater: {
    shader: 'scene',
    layers: [
      { shader: 'image', source: stylizedDark },
      {
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
      { shader: 'direct', target: 'subject' },
    ],
  },

  // Deep space: the procedural nebula as a full-frame backdrop, you composited
  // over it. A candidate background for the bridge "space observation deck"
  // scene (which slots the deck plate over this and adds the lens flare on top);
  // standalone here as its own preset.
  nebula: {
    shader: 'scene',
    layers: [
      {
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
      { shader: 'direct', target: 'subject' },
    ],
  },

  // Simianlights: the nebula's calmer sibling (sparser, larger glowing orbs) as
  // a standalone space backdrop, you composited over it. The other candidate
  // background for the bridge "space observation deck" scene.
  simianlights: {
    shader: 'scene',
    layers: [
      {
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
      { shader: 'direct', target: 'subject' },
    ],
  },

  // Daytime clouds: plain blue-sky raymarched clouds with you composited over
  // them. No overlay; just the sky behind you.
  clouds: {
    shader: 'scene',
    layers: [
      {
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
      { shader: 'direct', target: 'subject' },
    ],
  },

  // Transforms are NOT book presets: they're driven by the transform() verb
  // (flip/rotate), not curated art. The book is the art catalog only.
} as const satisfies PresetBook;

export type PresetId = keyof typeof presets;
