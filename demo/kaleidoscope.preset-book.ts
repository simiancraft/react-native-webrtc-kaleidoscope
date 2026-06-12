// The consumer's preset book. Every entry is a name -> KaleidoscopePreset: an ordered
// painter's stack of layers, plus a readable `name` and a `taxonomy` (the
// picker's grouping path, root first). This is the file a consuming app owns and curates;
// the prebuild plugin (native) parses it to copy only the referenced
// image/shader sources into the bundle. On web it is read at runtime by
// kaleidoscope().
//
// The packaged "Worlds" and "Sky" composites are imported from the library
// (`react-native-webrtc-kaleidoscope/composites/<name>`); the book lists them by
// spreading them in. The simpler Backgrounds, Blur, and Plasma entries
// stay inline as the demo's curated examples and the consumer-authoring pattern:
// each references a library image (`.../images/<category>/<leaf>`) or a library shader by
// name. `wolf-cave` is a demo-OWNED image (not in the package), proving a
// consumer can add their own background.
//
// Layer ids are unique WITHIN one composite. An `image` layer's id doubles as
// its native plate id (the bundled WebP basename), so image layers keep their
// plate-basename id; every other layer gets a simple unique-per-preset id.
//
// `as const satisfies KaleidoscopePresetBook` gives per-layer typing and rejects a wrong
// layer shape at compile time.

import { Asset } from 'expo-asset';
import type { KaleidoscopePresetBook } from 'react-native-webrtc-kaleidoscope';
// Packaged composites (the "Worlds" and "Sky" scenes), shipped by the library.
import { clouds } from 'react-native-webrtc-kaleidoscope/composites/clouds';
import { CloudsControls } from 'react-native-webrtc-kaleidoscope/composites/clouds/controls';
import { corporateBlobs } from 'react-native-webrtc-kaleidoscope/composites/corporate-blobs';
import { CorporateBlobsControls } from 'react-native-webrtc-kaleidoscope/composites/corporate-blobs/controls';
import { fairyCave } from 'react-native-webrtc-kaleidoscope/composites/fairy-cave';
import { FairyCaveControls } from 'react-native-webrtc-kaleidoscope/composites/fairy-cave/controls';
import { fairyGrotto } from 'react-native-webrtc-kaleidoscope/composites/fairy-grotto';
import { FairyGrottoControls } from 'react-native-webrtc-kaleidoscope/composites/fairy-grotto/controls';
import { fairyHollow } from 'react-native-webrtc-kaleidoscope/composites/fairy-hollow';
import { FairyHollowControls } from 'react-native-webrtc-kaleidoscope/composites/fairy-hollow/controls';
import { nebula } from 'react-native-webrtc-kaleidoscope/composites/nebula';
import { NebulaControls } from 'react-native-webrtc-kaleidoscope/composites/nebula/controls';
import { observationDeck } from 'react-native-webrtc-kaleidoscope/composites/observation-deck';
import { ObservationDeckControls } from 'react-native-webrtc-kaleidoscope/composites/observation-deck/controls';
import { simianlights } from 'react-native-webrtc-kaleidoscope/composites/simianlights';
import { SimianlightsControls } from 'react-native-webrtc-kaleidoscope/composites/simianlights/controls';
import { underwater } from 'react-native-webrtc-kaleidoscope/composites/underwater';
import { UnderwaterControls } from 'react-native-webrtc-kaleidoscope/composites/underwater/controls';
import { wizardTower } from 'react-native-webrtc-kaleidoscope/composites/wizard-tower';
import { WizardTowerControls } from 'react-native-webrtc-kaleidoscope/composites/wizard-tower/controls';
import { wizardTowerNight } from 'react-native-webrtc-kaleidoscope/composites/wizard-tower-night';
import { WizardTowerNightControls } from 'react-native-webrtc-kaleidoscope/composites/wizard-tower-night/controls';
// Library-shipped image presets; each resolves to a bundled WebP URL on web and
// to the preset name on native. The simiancraft presets lead (shop's demo).
import { BlurForm } from 'react-native-webrtc-kaleidoscope/shaders/blur/form';
import { KaleidoscopeForm } from 'react-native-webrtc-kaleidoscope/shaders/kaleidoscope/form';
import { LightBeamsAndMotesForm } from 'react-native-webrtc-kaleidoscope/shaders/light-beams-and-motes/form';
import { NeoMemphisForm } from 'react-native-webrtc-kaleidoscope/shaders/neo-memphis/form';
import { PlasmaForm } from 'react-native-webrtc-kaleidoscope/shaders/plasma/form';
import { officeDark } from 'react-native-webrtc-kaleidoscope/images/office/office-dark';
import { debugResolutions } from 'react-native-webrtc-kaleidoscope/images/debug/debug-resolutions';
import { homeDark } from 'react-native-webrtc-kaleidoscope/images/home/home-dark';
import { homeLight } from 'react-native-webrtc-kaleidoscope/images/home/home-light';
import { officeLight } from 'react-native-webrtc-kaleidoscope/images/office/office-light';
import { landscapeDark } from 'react-native-webrtc-kaleidoscope/images/nature/landscape-dark';
import { landscapeLight } from 'react-native-webrtc-kaleidoscope/images/nature/landscape-light';
import { simiancraftDark } from 'react-native-webrtc-kaleidoscope/images/simiancraft/simiancraft-dark';
import { simiancraftLight } from 'react-native-webrtc-kaleidoscope/images/simiancraft/simiancraft-light';
import { sciFiLight } from 'react-native-webrtc-kaleidoscope/images/sci-fi/sci-fi-light';
import { oceanscapeDark } from 'react-native-webrtc-kaleidoscope/images/underwater/oceanscape-dark';

const wolfCave = Asset.fromModule(require('./assets/backgrounds/wolf-cave.webp')).uri;

export const presets = {
  // --- Effects: your video run through some DSP. Blur is a camera-sampling blur
  // on the background, you sharp on top. ---
  'blur-low': {
    name: 'Low',
    taxonomy: ['Effects', 'Blur'],
    controls: BlurForm,
    layers: [
      { id: 'blur', shader: 'blur', target: 'background', uniforms: { sigma: 1.5 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'blur-medium': {
    name: 'Medium',
    taxonomy: ['Effects', 'Blur'],
    controls: BlurForm,
    layers: [
      { id: 'blur', shader: 'blur', target: 'background', uniforms: { sigma: 3.75 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'blur-high': {
    name: 'High',
    taxonomy: ['Effects', 'Blur'],
    controls: BlurForm,
    layers: [
      { id: 'blur', shader: 'blur', target: 'background', uniforms: { sigma: 8 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // --- Worlds: composed scenes, imported from the library. Each carries its own
  // depth-2 taxonomy (group 'Worlds', category per scene). ---
  'wizard-tower': { ...wizardTower, controls: WizardTowerControls },
  'wizard-tower-night': { ...wizardTowerNight, controls: WizardTowerNightControls },
  'observation-deck': { ...observationDeck, controls: ObservationDeckControls },
  'fairy-cave': { ...fairyCave, controls: FairyCaveControls },
  'fairy-grotto': { ...fairyGrotto, controls: FairyGrottoControls },
  'fairy-hollow': { ...fairyHollow, controls: FairyHollowControls },
  underwater: { ...underwater, controls: UnderwaterControls },
  'corporate-blobs': { ...corporateBlobs, controls: CorporateBlobsControls },

  // --- Backgrounds: one image layer (cover-fit). The id is the plate basename;
  // the thumbnail is the same image source. Simiancraft leads (shop's demo). ---
  'simiancraft-light': {
    name: 'Simiancraft Light',
    taxonomy: ['Backgrounds', 'Simiancraft'],
    thumbnail: simiancraftLight,
    layers: [{ id: 'simiancraft-light', shader: 'image', source: simiancraftLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'simiancraft-dark': {
    name: 'Simiancraft Dark',
    taxonomy: ['Backgrounds', 'Simiancraft'],
    thumbnail: simiancraftDark,
    layers: [{ id: 'simiancraft-dark', shader: 'image', source: simiancraftDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'office-dark': {
    name: 'Dark Office',
    taxonomy: ['Backgrounds', 'Office'],
    thumbnail: officeDark,
    layers: [{ id: 'office-dark', shader: 'image', source: officeDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'office-light': {
    name: 'Light Office',
    taxonomy: ['Backgrounds', 'Office'],
    thumbnail: officeLight,
    layers: [{ id: 'office-light', shader: 'image', source: officeLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'landscape-light': {
    name: 'Nature Light',
    taxonomy: ['Backgrounds', 'Nature'],
    thumbnail: landscapeLight,
    layers: [{ id: 'landscape-light', shader: 'image', source: landscapeLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'landscape-dark': {
    name: 'Nature Dark',
    taxonomy: ['Backgrounds', 'Nature'],
    thumbnail: landscapeDark,
    layers: [{ id: 'landscape-dark', shader: 'image', source: landscapeDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'home-light': {
    name: 'Home Light',
    taxonomy: ['Backgrounds', 'Home'],
    thumbnail: homeLight,
    layers: [{ id: 'home-light', shader: 'image', source: homeLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'home-dark': {
    name: 'Home Dark',
    taxonomy: ['Backgrounds', 'Home'],
    thumbnail: homeDark,
    layers: [{ id: 'home-dark', shader: 'image', source: homeDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'sci-fi-light': {
    name: 'Landscape',
    taxonomy: ['Backgrounds', 'Sci-Fi'],
    thumbnail: sciFiLight,
    layers: [{ id: 'sci-fi-light', shader: 'image', source: sciFiLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'oceanscape-dark': {
    name: 'Underwater',
    taxonomy: ['Backgrounds', 'Ocean'],
    thumbnail: oceanscapeDark,
    layers: [{ id: 'oceanscape-dark', shader: 'image', source: oceanscapeDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'debug-resolutions': {
    name: 'Resolutions',
    taxonomy: ['Backgrounds', 'Debug'],
    thumbnail: debugResolutions,
    layers: [{ id: 'debug-resolutions', shader: 'image', source: debugResolutions }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  // A demo-owned image (NOT part of the package), proving a consumer can add
  // their own background. The prebuild plugin reads the require specifier to copy
  // it into the native bundle as wolf-cave.webp.
  'wolf-cave': {
    name: 'Wolf Cave',
    taxonomy: ['Backgrounds', 'User'],
    thumbnail: wolfCave,
    layers: [{ id: 'wolf-cave', shader: 'image', source: wolfCave }, { id: 'you', shader: 'direct', target: 'subject' }],
  },

  // --- Shaders: generative GLSL fields with you composited over them. clouds,
  // nebula, and simianlights are packaged composites (their own depth-2
  // taxonomy); the plasma entries stay inline as the consumer-authoring pattern. ---
  clouds: { ...clouds, controls: CloudsControls },
  'plasma-ocean': {
    name: 'Ocean',
    taxonomy: ['Shaders', 'Plasma'],
    controls: PlasmaForm,
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
    taxonomy: ['Shaders', 'Plasma'],
    controls: PlasmaForm,
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
    taxonomy: ['Shaders', 'Plasma'],
    controls: PlasmaForm,
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
    taxonomy: ['Shaders', 'Plasma'],
    controls: PlasmaForm,
    layers: [
      {
        id: 'plasma',
        shader: 'plasma',
        uniforms: { uColorA: [0.9, 0.3, 0.1], uColorB: [0.8, 0.1, 0.5], uSpeed: 0.9, uScale: 10 },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'kaleidoscope-stained-glass': {
    name: 'Stained Glass',
    taxonomy: ['Shaders', 'Kaleidoscope'],
    controls: KaleidoscopeForm,
    layers: [
      {
        id: 'kaleidoscope',
        shader: 'kaleidoscope',
        uniforms: {
          uColorA: [0.07, 0.15, 0.36],
          uColorB: [0.1, 0.55, 0.62],
          uColorC: [0.93, 0.69, 0.21],
          uSegments: 8,
          uSpeed: 0.35,
          uRotate: 0.04,
          uZoom: 1.6,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'kaleidoscope-mandala': {
    name: 'Mandala',
    taxonomy: ['Shaders', 'Kaleidoscope'],
    controls: KaleidoscopeForm,
    layers: [
      {
        id: 'kaleidoscope',
        shader: 'kaleidoscope',
        uniforms: {
          uColorA: [0.24, 0.08, 0.28],
          uColorB: [0.85, 0.36, 0.32],
          uColorC: [0.95, 0.78, 0.35],
          uSegments: 12,
          uSpeed: 0.3,
          uRotate: -0.03,
          uZoom: 2.4,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'kaleidoscope-prism': {
    name: 'Prism',
    taxonomy: ['Shaders', 'Kaleidoscope'],
    controls: KaleidoscopeForm,
    layers: [
      {
        id: 'kaleidoscope',
        shader: 'kaleidoscope',
        uniforms: {
          uColorA: [0.1, 0.13, 0.22],
          uColorB: [0.35, 0.45, 0.62],
          uColorC: [0.92, 0.94, 0.97],
          uSegments: 6,
          uSpeed: 0.22,
          uRotate: 0.02,
          uZoom: 1.2,
          uCalm: 0.35,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'neo-memphis-jazz-cup': {
    name: 'Jazz Cup',
    taxonomy: ['Shaders', 'Neo-Memphis'],
    controls: NeoMemphisForm,
    layers: [
      {
        id: 'neo-memphis',
        shader: 'neo-memphis',
        uniforms: {
          uBgColor: [0.93, 0.95, 0.96],
          uColorA: [0.0, 0.65, 0.66],
          uColorB: [0.42, 0.2, 0.62],
          uColorC: [0.05, 0.42, 0.7],
          uScale: 4,
          uDensity: 0.62,
          uOutline: 0.5,
          uDrift: 0.5,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'neo-memphis-bauhaus': {
    name: 'Bauhaus',
    taxonomy: ['Shaders', 'Neo-Memphis'],
    controls: NeoMemphisForm,
    layers: [
      {
        id: 'neo-memphis',
        shader: 'neo-memphis',
        uniforms: {
          uBgColor: [0.92, 0.89, 0.83],
          uColorA: [0.86, 0.2, 0.18],
          uColorB: [0.95, 0.72, 0.12],
          uColorC: [0.13, 0.23, 0.47],
          uScale: 3,
          uDensity: 0.55,
          uOutline: 0.15,
          uDrift: 0.35,
          uCalm: 0.3,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'neo-memphis-confetti': {
    name: 'Confetti',
    taxonomy: ['Shaders', 'Neo-Memphis'],
    controls: NeoMemphisForm,
    layers: [
      {
        id: 'neo-memphis',
        shader: 'neo-memphis',
        uniforms: {
          uBgColor: [0.14, 0.14, 0.18],
          uColorA: [0.95, 0.55, 0.66],
          uColorB: [0.45, 0.78, 0.9],
          uColorC: [0.96, 0.83, 0.4],
          uScale: 8,
          uDensity: 0.75,
          uOutline: 0.2,
          uDrift: 0.8,
          uCalm: 0.4,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  nebula: { ...nebula, controls: NebulaControls },
  simianlights: { ...simianlights, controls: SimianlightsControls },

  // --- Worlds: Interior. A still room + a volumetric light-beams overlay (one
  // beam, the other two off) aimed at the room's real light, to make a static
  // interior feel alive. The `interior-ab-3beam` entry is the same shader with all
  // three beams shown. ---
  'interior-home': {
    name: 'Home',
    taxonomy: ['Worlds', 'Interior'],
    thumbnail: homeLight,
    controls: LightBeamsAndMotesForm,
    layers: [
      { id: 'home-light', shader: 'image', source: homeLight },
      { id: 'you', shader: 'direct', target: 'subject' },
      {
        id: 'beams',
        shader: 'light-beams-and-motes',
        blend: 'additive',
        uniforms: {
          uSpeed: 1,
          uBeamSoftness: 0.03,
          uOverlayAlpha: 0.85,
          uBeam1On: 1,
          uBeam1Color: [0.93, 0.68, 0.2],
          uBeam1Alpha: 0.22,
          uBeam1Poly: [-0.2, 1.05, -0.04, 0.96, -0.14, -0.19, 1.2, 0.03],
          uBeam2On: 0,
          uBeam2Color: [0.54, 1, 0.62],
          uBeam2Alpha: 0.086,
          uBeam2Poly: [0.45, 1.05, 0.57, 1.05, 0.33, 0, 0.73, 0],
          uBeam3On: 0,
          uBeam3Color: [0.55, 0.66, 1],
          uBeam3Alpha: 0.104,
          uBeam3Poly: [0.82, 1.05, 0.99, 1.05, 0.38, 0, 0.7, 0],
          uMoteCount: 15,
          uMoteAlpha: 1,
          uGlowSize: 5.9,
        },
      },
    ],
  },
  'interior-office': {
    name: 'Office',
    taxonomy: ['Worlds', 'Interior'],
    thumbnail: officeLight,
    controls: LightBeamsAndMotesForm,
    layers: [
      { id: 'office-light', shader: 'image', source: officeLight },
      { id: 'you', shader: 'direct', target: 'subject' },
      {
        id: 'beams',
        shader: 'light-beams-and-motes',
        blend: 'additive',
        uniforms: {
          uSpeed: 1,
          uBeamSoftness: 0.06,
          uOverlayAlpha: 0.85,
          uBeam1On: 1,
          uBeam1Color: [1, 0.52, 0.37],
          uBeam1Alpha: 0.22,
          uBeam1Poly: [-0.2, 0.84, -0.1, 0.96, -0.12, -0.05, 0.65, -0.05],
          uBeam2On: 0,
          uBeam2Color: [0.54, 1, 0.62],
          uBeam2Alpha: 0.086,
          uBeam2Poly: [0.45, 1.05, 0.57, 1.05, 0.33, 0, 0.73, 0],
          uBeam3On: 0,
          uBeam3Color: [0.55, 0.66, 1],
          uBeam3Alpha: 0.104,
          uBeam3Poly: [0.82, 1.05, 0.99, 1.05, 0.38, 0, 0.7, 0],
          uMoteCount: 13,
          uMoteAlpha: 1,
          uGlowSize: 1,
        },
      },
    ],
  },
  'interior-ab-shaft': {
    name: 'A/B 1-shaft',
    taxonomy: ['Worlds', 'Interior'],
    thumbnail: officeDark,
    controls: LightBeamsAndMotesForm,
    layers: [
      { id: 'office-dark', shader: 'image', source: officeDark },
      { id: 'you', shader: 'direct', target: 'subject' },
      {
        id: 'beams',
        shader: 'light-beams-and-motes',
        blend: 'additive',
        uniforms: {
          uSpeed: 1,
          uBeamSoftness: 0.045,
          uOverlayAlpha: 0.85,
          uBeam1On: 1,
          uBeam1Color: [0.95, 0.79, 0.56],
          uBeam1Alpha: 0.44,
          uBeam1Poly: [0.44, 0.87, 0.56, 0.85, 0.21, 0, 0.8, 0],
          uBeam2On: 0,
          uBeam2Color: [0.54, 1, 0.62],
          uBeam2Alpha: 0.086,
          uBeam2Poly: [0.45, 1.05, 0.57, 1.05, 0.33, 0, 0.73, 0],
          uBeam3On: 0,
          uBeam3Color: [0.55, 0.66, 1],
          uBeam3Alpha: 0.104,
          uBeam3Poly: [0.82, 1.05, 0.99, 1.05, 0.38, 0, 0.7, 0],
          uMoteCount: 16,
          uMoteAlpha: 1.6,
          uGlowSize: 3.2,
        },
      },
    ],
  },
  'interior-ab-3beam': {
    name: 'A/B 3-beam',
    taxonomy: ['Worlds', 'Interior'],
    thumbnail: officeDark,
    controls: LightBeamsAndMotesForm,
    layers: [
      { id: 'office-dark', shader: 'image', source: officeDark },
      { id: 'you', shader: 'direct', target: 'subject' },
      {
        id: 'beams',
        shader: 'light-beams-and-motes',
        blend: 'additive',
        uniforms: {
          uSpeed: 1,
          uBeamSoftness: 0.045,
          uOverlayAlpha: 0.85,
          uBeam1On: 1,
          uBeam1Color: [0.95, 0.79, 0.56],
          uBeam1Alpha: 0.44,
          uBeam1Poly: [0.44, 0.87, 0.56, 0.85, 0.21, 0, 0.8, 0],
          uBeam2On: 0,
          uBeam2Color: [0.54, 1, 0.62],
          uBeam2Alpha: 0.086,
          uBeam2Poly: [0.45, 1.05, 0.57, 1.05, 0.33, 0, 0.73, 0],
          uBeam3On: 0,
          uBeam3Color: [0.55, 0.66, 1],
          uBeam3Alpha: 0.104,
          uBeam3Poly: [0.82, 1.05, 0.99, 1.05, 0.38, 0, 0.7, 0],
          uMoteCount: 48,
          uMoteAlpha: 1.6,
          uGlowSize: 3.2,
        },
      },
    ],
  },

  // Transforms are NOT book presets: they're driven by the transform() verb
  // (flip/rotate), not curated art. The book is the art catalog only.
} as const satisfies KaleidoscopePresetBook;

export type PresetId = keyof typeof presets;
