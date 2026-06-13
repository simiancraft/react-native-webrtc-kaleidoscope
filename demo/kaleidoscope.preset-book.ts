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
import { AuroraSilkForm } from 'react-native-webrtc-kaleidoscope/shaders/aurora-silk/form';
import { BlurForm } from 'react-native-webrtc-kaleidoscope/shaders/blur/form';
import { DataMeshForm } from 'react-native-webrtc-kaleidoscope/shaders/data-mesh/form';
import { HalftoneWavesForm } from 'react-native-webrtc-kaleidoscope/shaders/halftone-waves/form';
import { KaleidoscopeForm } from 'react-native-webrtc-kaleidoscope/shaders/kaleidoscope/form';
import { LightBeamsAndMotesForm } from 'react-native-webrtc-kaleidoscope/shaders/light-beams-and-motes/form';
import { NeoMemphisForm } from 'react-native-webrtc-kaleidoscope/shaders/neo-memphis/form';
import { OutrunGridForm } from 'react-native-webrtc-kaleidoscope/shaders/outrun-grid/form';
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/blur-low.thumb.webp')).uri,
    controls: BlurForm,
    layers: [
      { id: 'blur', shader: 'blur', target: 'background', uniforms: { sigma: 1.5 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'blur-medium': {
    name: 'Medium',
    taxonomy: ['Effects', 'Blur'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/blur-medium.thumb.webp')).uri,
    controls: BlurForm,
    layers: [
      { id: 'blur', shader: 'blur', target: 'background', uniforms: { sigma: 3.75 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'blur-high': {
    name: 'High',
    taxonomy: ['Effects', 'Blur'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/blur-high.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/simiancraft-light.thumb.webp')).uri,
    layers: [{ id: 'simiancraft-light', shader: 'image', source: simiancraftLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'simiancraft-dark': {
    name: 'Simiancraft Dark',
    taxonomy: ['Backgrounds', 'Simiancraft'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/simiancraft-dark.thumb.webp')).uri,
    layers: [{ id: 'simiancraft-dark', shader: 'image', source: simiancraftDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'office-dark': {
    name: 'Dark Office',
    taxonomy: ['Backgrounds', 'Office'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/office-dark.thumb.webp')).uri,
    layers: [{ id: 'office-dark', shader: 'image', source: officeDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'office-light': {
    name: 'Light Office',
    taxonomy: ['Backgrounds', 'Office'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/office-light.thumb.webp')).uri,
    layers: [{ id: 'office-light', shader: 'image', source: officeLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'landscape-light': {
    name: 'Nature Light',
    taxonomy: ['Backgrounds', 'Nature'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/landscape-light.thumb.webp')).uri,
    layers: [{ id: 'landscape-light', shader: 'image', source: landscapeLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'landscape-dark': {
    name: 'Nature Dark',
    taxonomy: ['Backgrounds', 'Nature'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/landscape-dark.thumb.webp')).uri,
    layers: [{ id: 'landscape-dark', shader: 'image', source: landscapeDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'home-light': {
    name: 'Home Light',
    taxonomy: ['Backgrounds', 'Home'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/home-light.thumb.webp')).uri,
    layers: [{ id: 'home-light', shader: 'image', source: homeLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'home-dark': {
    name: 'Home Dark',
    taxonomy: ['Backgrounds', 'Home'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/home-dark.thumb.webp')).uri,
    layers: [{ id: 'home-dark', shader: 'image', source: homeDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'sci-fi-light': {
    name: 'Landscape',
    taxonomy: ['Backgrounds', 'Sci-Fi'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/sci-fi-light.thumb.webp')).uri,
    layers: [{ id: 'sci-fi-light', shader: 'image', source: sciFiLight }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'oceanscape-dark': {
    name: 'Underwater',
    taxonomy: ['Backgrounds', 'Ocean'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/oceanscape-dark.thumb.webp')).uri,
    layers: [{ id: 'oceanscape-dark', shader: 'image', source: oceanscapeDark }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  'debug-resolutions': {
    name: 'Resolutions',
    taxonomy: ['Backgrounds', 'Debug'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/debug-resolutions.thumb.webp')).uri,
    layers: [{ id: 'debug-resolutions', shader: 'image', source: debugResolutions }, { id: 'you', shader: 'direct', target: 'subject' }],
  },
  // A demo-owned image (NOT part of the package), proving a consumer can add
  // their own background. The prebuild plugin reads the require specifier to copy
  // it into the native bundle as wolf-cave.webp.
  'wolf-cave': {
    name: 'Wolf Cave',
    taxonomy: ['Backgrounds', 'User'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/wolf-cave.thumb.webp')).uri,
    layers: [{ id: 'wolf-cave', shader: 'image', source: wolfCave }, { id: 'you', shader: 'direct', target: 'subject' }],
  },

  // --- Shaders: generative GLSL fields with you composited over them. clouds,
  // nebula, and simianlights are packaged composites (their own depth-2
  // taxonomy); the plasma entries stay inline as the consumer-authoring pattern. ---
  clouds: { ...clouds, controls: CloudsControls },
  // Times-of-day + one otherworld sky: the same clouds shader fanned into named
  // looks, exactly like the plasma entries below (issue #59). Layer id stays
  // 'sky' so CloudsControls addresses every variant.
  'clouds-dawn': {
    name: 'Dawn',
    taxonomy: ['Shaders', 'Sky'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/clouds-dawn.thumb.webp')).uri,
    controls: CloudsControls,
    layers: [
      {
        id: 'sky',
        shader: 'clouds',
        uniforms: {
          uSkyLowColor: [0.98, 0.62, 0.42],
          uSkyHighColor: [0.25, 0.35, 0.75],
          uCloudLightColor: [1.0, 0.8, 0.55],
          uCloudDarkColor: [0.5, 0.3, 0.4],
          uExposure: 1.15,
          uStepSize: 0.2,
          uCloudSpeed: 0.1,
          uCloudScale: 0.9,
          uDensity: 0.22,
          uCoverage: 0.58,
          uSoftness: 0.32,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'clouds-dusk': {
    name: 'Dusk',
    taxonomy: ['Shaders', 'Sky'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/clouds-dusk.thumb.webp')).uri,
    controls: CloudsControls,
    layers: [
      {
        id: 'sky',
        shader: 'clouds',
        uniforms: {
          uSkyLowColor: [1.0, 0.42, 0.15],
          uSkyHighColor: [0.25, 0.1, 0.5],
          uCloudLightColor: [1.0, 0.6, 0.3],
          uCloudDarkColor: [0.25, 0.12, 0.3],
          uExposure: 1.15,
          uStepSize: 0.22,
          uCloudSpeed: 0.18,
          uCloudScale: 1.0,
          uDensity: 0.25,
          uCoverage: 0.5,
          uSoftness: 0.3,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'clouds-night': {
    name: 'Night',
    taxonomy: ['Shaders', 'Sky'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/clouds-night.thumb.webp')).uri,
    controls: CloudsControls,
    layers: [
      {
        id: 'sky',
        shader: 'clouds',
        uniforms: {
          uSkyLowColor: [0.1, 0.14, 0.3],
          uSkyHighColor: [0.01, 0.02, 0.08],
          uCloudLightColor: [0.75, 0.8, 0.95],
          uCloudDarkColor: [0.06, 0.08, 0.16],
          uExposure: 1.0,
          uStepSize: 0.3,
          uCloudSpeed: 0.12,
          uCloudScale: 1.0,
          uDensity: 0.2,
          uCoverage: 0.45,
          uSoftness: 0.25,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'clouds-otherworld': {
    name: 'Otherworld',
    taxonomy: ['Shaders', 'Sky'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/clouds-otherworld.thumb.webp')).uri,
    controls: CloudsControls,
    layers: [
      {
        id: 'sky',
        shader: 'clouds',
        uniforms: {
          uSkyLowColor: [0.0, 0.6, 0.4],
          uSkyHighColor: [0.4, 0.05, 0.65],
          uCloudLightColor: [0.8, 1.0, 0.5],
          uCloudDarkColor: [0.05, 0.2, 0.25],
          uExposure: 1.2,
          uStepSize: 0.24,
          uCloudSpeed: 0.3,
          uCloudScale: 1.35,
          uDensity: 0.3,
          uCoverage: 0.55,
          uSoftness: 0.25,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'plasma-ocean': {
    name: 'Ocean',
    taxonomy: ['Shaders', 'Plasma'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/plasma-ocean.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/plasma-sunset.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/plasma-mint.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/plasma-fast.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/kaleidoscope-stained-glass.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/kaleidoscope-mandala.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/kaleidoscope-prism.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/neo-memphis-jazz-cup.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/neo-memphis-bauhaus.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/neo-memphis-confetti.thumb.webp')).uri,
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
  'halftone-boardroom': {
    name: 'Boardroom',
    taxonomy: ['Shaders', 'Halftone'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/halftone-boardroom.thumb.webp')).uri,
    controls: HalftoneWavesForm,
    layers: [
      {
        id: 'halftone-waves',
        shader: 'halftone-waves',
        uniforms: {
          uPaper: [0.95, 0.95, 0.94],
          uInk: [0.62, 0.66, 0.7],
          uPitch: 26,
          uDotSize: 0.26,
          uWaveAmp: 0.55,
          uSpeed: 0.5,
          uShape: 1,
          uAngle: 0.6,
          uCalm: 0.3,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'halftone-press': {
    name: 'Press',
    taxonomy: ['Shaders', 'Halftone'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/halftone-press.thumb.webp')).uri,
    controls: HalftoneWavesForm,
    layers: [
      {
        id: 'halftone-waves',
        shader: 'halftone-waves',
        uniforms: {
          uPaper: [0.12, 0.13, 0.16],
          uInk: [0.85, 0.87, 0.9],
          uPitch: 34,
          uDotSize: 0.22,
          uWaveAmp: 0.7,
          uSpeed: 0.4,
          uShape: 2,
          uAngle: 2.2,
          uCalm: 0.35,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'halftone-ripple': {
    name: 'Ripple',
    taxonomy: ['Shaders', 'Halftone'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/halftone-ripple.thumb.webp')).uri,
    controls: HalftoneWavesForm,
    layers: [
      {
        id: 'halftone-waves',
        shader: 'halftone-waves',
        uniforms: {
          uPaper: [0.07, 0.21, 0.32],
          uInk: [0.3, 0.75, 0.78],
          uPitch: 22,
          uDotSize: 0.3,
          uWaveAmp: 0.8,
          uSpeed: 0.7,
          uShape: 0,
          uAngle: 1.1,
          uCalm: 0.25,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'aurora-corporate-silk': {
    name: 'Corporate Silk',
    taxonomy: ['Shaders', 'Aurora'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/aurora-corporate-silk.thumb.webp')).uri,
    controls: AuroraSilkForm,
    layers: [
      {
        id: 'aurora-silk',
        shader: 'aurora-silk',
        uniforms: {
          uColorLow: [0.08, 0.11, 0.22],
          uColorHigh: [0.16, 0.29, 0.48],
          uRibbonColor: [0.36, 0.62, 0.85],
          uRibbons: 4,
          uSoftness: 0.7,
          uAngle: 0.5,
          uSpeed: 0.6,
          uStyle: 0.8,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'aurora-dusk': {
    name: 'Dusk',
    taxonomy: ['Shaders', 'Aurora'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/aurora-dusk.thumb.webp')).uri,
    controls: AuroraSilkForm,
    layers: [
      {
        id: 'aurora-silk',
        shader: 'aurora-silk',
        uniforms: {
          uColorLow: [0.18, 0.09, 0.2],
          uColorHigh: [0.55, 0.25, 0.3],
          uRibbonColor: [0.95, 0.6, 0.35],
          uRibbons: 3,
          uSoftness: 0.85,
          uAngle: 0.25,
          uSpeed: 0.45,
          uStyle: 1,
          uCalm: 0.3,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'aurora-polar': {
    name: 'Polar',
    taxonomy: ['Shaders', 'Aurora'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/aurora-polar.thumb.webp')).uri,
    controls: AuroraSilkForm,
    layers: [
      {
        id: 'aurora-silk',
        shader: 'aurora-silk',
        uniforms: {
          uColorLow: [0.9, 0.93, 0.96],
          uColorHigh: [0.75, 0.85, 0.92],
          uRibbonColor: [0.45, 0.65, 0.8],
          uRibbons: 5,
          uSoftness: 0.2,
          uAngle: 5.9,
          uSpeed: 0.5,
          uStyle: 0,
          uCalm: 0.25,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  // Outrun (issue #70): one outrun-grid.frag fanned into deliberately divergent
  // palettes; the grid tint, the two sun colors, and the sky hue are the levers.
  // Layer id stays 'outrun-grid' so OutrunGridForm addresses every variant.
  'outrun-classic': {
    name: 'Classic',
    taxonomy: ['Shaders', 'Outrun'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/outrun-classic.thumb.webp')).uri,
    controls: OutrunGridForm,
    layers: [
      {
        id: 'outrun-grid',
        shader: 'outrun-grid',
        uniforms: {
          uSkyTop: [0.05, 0.02, 0.18],
          uSkyHorizon: [0.35, 0.05, 0.4],
          uSunTop: [1.0, 0.85, 0.3],
          uSunBottom: [0.95, 0.15, 0.5],
          uGridColor: [0.95, 0.2, 0.7],
          uGridDensity: 12,
          uGridGlow: 0.5,
          uSpeed: 0.6,
          uSunSize: 0.32,
          uSunBands: 7,
          uHorizon: 0.55,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'outrun-miami': {
    name: 'Miami',
    taxonomy: ['Shaders', 'Outrun'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/outrun-miami.thumb.webp')).uri,
    controls: OutrunGridForm,
    layers: [
      {
        id: 'outrun-grid',
        shader: 'outrun-grid',
        uniforms: {
          uSkyTop: [0.12, 0.04, 0.28],
          uSkyHorizon: [0.95, 0.45, 0.35],
          uSunTop: [1.0, 0.95, 0.55],
          uSunBottom: [1.0, 0.35, 0.45],
          uGridColor: [0.1, 0.85, 0.8],
          uGridDensity: 14,
          uGridGlow: 0.55,
          uSpeed: 0.5,
          uSunSize: 0.36,
          uSunBands: 8,
          uHorizon: 0.5,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'outrun-circuit': {
    name: 'Circuit',
    taxonomy: ['Shaders', 'Outrun'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/outrun-circuit.thumb.webp')).uri,
    controls: OutrunGridForm,
    layers: [
      {
        id: 'outrun-grid',
        shader: 'outrun-grid',
        uniforms: {
          uSkyTop: [0.0, 0.02, 0.05],
          uSkyHorizon: [0.0, 0.15, 0.3],
          uSunTop: [0.8, 0.95, 1.0],
          uSunBottom: [0.1, 0.5, 0.95],
          uGridColor: [0.2, 0.8, 1.0],
          uGridDensity: 16,
          uGridGlow: 0.4,
          uSpeed: 0.8,
          uSunSize: 0.26,
          uSunBands: 5,
          uHorizon: 0.6,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'outrun-acid': {
    name: 'Acid',
    taxonomy: ['Shaders', 'Outrun'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/outrun-acid.thumb.webp')).uri,
    controls: OutrunGridForm,
    layers: [
      {
        id: 'outrun-grid',
        shader: 'outrun-grid',
        uniforms: {
          uSkyTop: [0.02, 0.06, 0.02],
          uSkyHorizon: [0.1, 0.3, 0.05],
          uSunTop: [0.85, 1.0, 0.3],
          uSunBottom: [0.3, 0.8, 0.1],
          uGridColor: [0.4, 1.0, 0.2],
          uGridDensity: 10,
          uGridGlow: 0.65,
          uSpeed: 0.9,
          uSunSize: 0.34,
          uSunBands: 9,
          uHorizon: 0.52,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'outrun-vapor': {
    name: 'Vapor',
    taxonomy: ['Shaders', 'Outrun'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/outrun-vapor.thumb.webp')).uri,
    controls: OutrunGridForm,
    layers: [
      {
        id: 'outrun-grid',
        shader: 'outrun-grid',
        uniforms: {
          uSkyTop: [0.45, 0.35, 0.7],
          uSkyHorizon: [0.95, 0.6, 0.8],
          uSunTop: [1.0, 0.9, 0.85],
          uSunBottom: [0.55, 0.85, 0.95],
          uGridColor: [0.95, 0.55, 0.85],
          uGridDensity: 9,
          uGridGlow: 0.7,
          uSpeed: 0.35,
          uSunSize: 0.4,
          uSunBands: 6,
          uHorizon: 0.5,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  nebula: { ...nebula, controls: NebulaControls },
  // Nebula variants (issue #59): same field, different grade and density.
  // Layer id stays 'nebula' so NebulaControls addresses every variant.
  'nebula-ember': {
    name: 'Ember',
    taxonomy: ['Shaders', 'Nebula'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/nebula-ember.thumb.webp')).uri,
    controls: NebulaControls,
    layers: [
      {
        id: 'nebula',
        shader: 'nebula',
        uniforms: {
          uColor: [1.0, 0.55, 0.15],
          uBrightness: 1.0,
          uSpeed: 0.12,
          uTwinkleSpeed: 1.2,
          uScale: 1.1,
          uStarGlow: 0.5,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'nebula-drift': {
    name: 'Drift',
    taxonomy: ['Shaders', 'Nebula'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/nebula-drift.thumb.webp')).uri,
    controls: NebulaControls,
    layers: [
      {
        id: 'nebula',
        shader: 'nebula',
        uniforms: {
          uColor: [0.7, 0.75, 1.0],
          uBrightness: 1.1,
          uSpeed: 0.08,
          uTwinkleSpeed: 0.6,
          uScale: 0.55,
          uStarGlow: 1.2,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  simianlights: { ...simianlights, controls: SimianlightsControls },
  // Simianlights variants (issue #59); layer id stays 'field'.
  'simianlights-glacier': {
    name: 'Glacier',
    taxonomy: ['Shaders', 'Simianlights'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/simianlights-glacier.thumb.webp')).uri,
    controls: SimianlightsControls,
    layers: [
      {
        id: 'field',
        shader: 'simianlights',
        uniforms: {
          uColor: [0.35, 0.7, 1.0],
          uBrightness: 0.6,
          uSpeed: 2.2,
          uTwinkleSpeed: 4,
          uScale: 1.1,
          uStarGlow: 0.7,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'simianlights-hearth': {
    name: 'Hearth',
    taxonomy: ['Shaders', 'Simianlights'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/simianlights-hearth.thumb.webp')).uri,
    controls: SimianlightsControls,
    layers: [
      {
        id: 'field',
        shader: 'simianlights',
        uniforms: {
          uColor: [1.0, 0.5, 0.1],
          uBrightness: 0.8,
          uSpeed: 1.2,
          uTwinkleSpeed: 1.5,
          uScale: 1.3,
          uStarGlow: 1.3,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // --- Worlds: Interior. A still room + a volumetric light-beams overlay (one
  // beam, the other two off) aimed at the room's real light, to make a static
  // interior feel alive. The `interior-ab-3beam` entry is the same shader with all
  // three beams shown. ---
  'interior-home': {
    name: 'Home',
    taxonomy: ['Worlds', 'Interior'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/interior-home.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/interior-office.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/interior-ab-shaft.thumb.webp')).uri,
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
    thumbnail: Asset.fromModule(require('./assets/thumbnails/interior-ab-3beam.thumb.webp')).uri,
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

  // --- Data-mesh: one frag (a wireframe wave heightfield with glowing nodes),
  // five very different moods by uniforms alone. ---
  'data-mesh-datafield': {
    name: 'Datafield',
    taxonomy: ['Shaders', 'Data-Mesh'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/data-mesh-datafield.thumb.webp')).uri,
    controls: DataMeshForm,
    layers: [
      {
        id: 'mesh',
        shader: 'data-mesh',
        uniforms: {
          uBgTop: [0.01, 0.02, 0.05],
          uBgBottom: [0.02, 0.05, 0.12],
          uLineColor: [0.1, 0.55, 0.75],
          uCrestColor: [0.85, 0.97, 1.0],
          uHazeColor: [0.05, 0.25, 0.4],
          uAccentColor: [0.9, 0.15, 0.12],
          uWaveScale: 1.2,
          uWaveAmp: 0.15,
          uWaveSpeed: 0.22,
          uGridX: 7,
          uHorizon: 0.16,
          uFarScale: 0.12,
          uSlant: 0.18,
          uLineWidth: 0.017,
          uNodeMix: 0.5,
          uStrutMix: 0.4,
          uGlow: 1.05,
          uHaze: 0.65,
          uParticles: 0.5,
          uAccent: 0,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'data-mesh-boardroom': {
    name: 'Boardroom',
    taxonomy: ['Shaders', 'Data-Mesh'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/data-mesh-boardroom.thumb.webp')).uri,
    controls: DataMeshForm,
    layers: [
      {
        id: 'mesh',
        shader: 'data-mesh',
        uniforms: {
          uBgTop: [0.05, 0.06, 0.07],
          uBgBottom: [0.12, 0.13, 0.15],
          uLineColor: [0.55, 0.6, 0.68],
          uCrestColor: [0.96, 0.97, 1.0],
          uHazeColor: [0.28, 0.3, 0.34],
          uAccentColor: [0.85, 0.1, 0.08],
          uWaveScale: 1.0,
          uWaveAmp: 0.13,
          uWaveSpeed: 0.14,
          uGridX: 8,
          uHorizon: 0.17,
          uFarScale: 0.13,
          uSlant: 0.3,
          uLineWidth: 0.014,
          uNodeMix: 0.2,
          uStrutMix: 0.75,
          uGlow: 0.85,
          uHaze: 0.5,
          uParticles: 0.15,
          uAccent: 0.9,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'data-mesh-acid': {
    name: 'Acid',
    taxonomy: ['Shaders', 'Data-Mesh'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/data-mesh-acid.thumb.webp')).uri,
    controls: DataMeshForm,
    layers: [
      {
        id: 'mesh',
        shader: 'data-mesh',
        uniforms: {
          uBgTop: [0.0, 0.0, 0.0],
          uBgBottom: [0.01, 0.04, 0.01],
          uLineColor: [0.25, 0.7, 0.12],
          uCrestColor: [0.75, 1.0, 0.4],
          uHazeColor: [0.08, 0.35, 0.05],
          uAccentColor: [0.7, 1.0, 0.2],
          uWaveScale: 1.4,
          uWaveAmp: 0.19,
          uWaveSpeed: 0.3,
          uGridX: 6,
          uHorizon: 0.15,
          uFarScale: 0.11,
          uSlant: -0.22,
          uLineWidth: 0.016,
          uNodeMix: 0.65,
          uStrutMix: 0.45,
          uGlow: 1.3,
          uHaze: 0.5,
          uParticles: 0.7,
          uAccent: 0,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'data-mesh-cobalt': {
    name: 'Cobalt',
    taxonomy: ['Shaders', 'Data-Mesh'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/data-mesh-cobalt.thumb.webp')).uri,
    controls: DataMeshForm,
    layers: [
      {
        id: 'mesh',
        shader: 'data-mesh',
        uniforms: {
          uBgTop: [0.03, 0.06, 0.2],
          uBgBottom: [0.06, 0.16, 0.5],
          uLineColor: [0.35, 0.62, 1.0],
          uCrestColor: [0.92, 0.97, 1.0],
          uHazeColor: [0.25, 0.45, 0.85],
          uAccentColor: [1.0, 0.8, 0.2],
          uWaveScale: 1.1,
          uWaveAmp: 0.14,
          uWaveSpeed: 0.2,
          uGridX: 7,
          uHorizon: 0.18,
          uFarScale: 0.13,
          uSlant: 0.2,
          uLineWidth: 0.018,
          uNodeMix: 0.45,
          uStrutMix: 0.5,
          uGlow: 1.05,
          uHaze: 0.9,
          uParticles: 0.4,
          uAccent: 0,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'data-mesh-slate': {
    name: 'Slate',
    taxonomy: ['Shaders', 'Data-Mesh'],
    thumbnail: Asset.fromModule(require('./assets/thumbnails/data-mesh-slate.thumb.webp')).uri,
    controls: DataMeshForm,
    layers: [
      {
        id: 'mesh',
        shader: 'data-mesh',
        uniforms: {
          uBgTop: [0.07, 0.08, 0.09],
          uBgBottom: [0.16, 0.17, 0.19],
          uLineColor: [0.65, 0.7, 0.78],
          uCrestColor: [0.98, 0.99, 1.0],
          uHazeColor: [0.35, 0.37, 0.4],
          uAccentColor: [0.8, 0.15, 0.12],
          uWaveScale: 0.95,
          uWaveAmp: 0.12,
          uWaveSpeed: 0.12,
          uGridX: 9,
          uHorizon: 0.18,
          uFarScale: 0.14,
          uSlant: 0.34,
          uLineWidth: 0.013,
          uNodeMix: 0.15,
          uStrutMix: 0.7,
          uGlow: 0.7,
          uHaze: 0.45,
          uParticles: 0,
          uAccent: 0,
          uCalm: 0,
        },
      },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },

  // Transforms are NOT book presets: they're driven by the transform() verb
  // (flip/rotate), not curated art. The book is the art catalog only.
} as const satisfies KaleidoscopePresetBook;

export type PresetId = keyof typeof presets;
