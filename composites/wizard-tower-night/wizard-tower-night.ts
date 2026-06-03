// Wizard tower (night): the same chamber as wizard-tower, lit by torchlight with
// a deep dusk sky through the cut-out, the night plate on top, you in the
// chamber. A variation of the wizard-tower composite with the clouds `sky`
// retuned to a moody night and the night plate swapped in.
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<name>` instead.

// Native variant. The thumbnail is the string id the prebuild plugin bundles
// `wizard-tower-night.thumb.webp` as into the native app target;
// `resolveBackgroundUri` looks it up in Bundle.main. The web sibling
// (wizard-tower-night.web.ts) keeps the `Asset.fromModule(...).uri` pattern.
import { wizardTowerNight as wizardTowerNightPlate } from '../../images/wizard-tower-night/wizard-tower-night';
import type { Composite } from '../../src/kaleidoscope/types';

export const wizardTowerNight = {
  name: 'Night',
  taxonomy: ['Worlds', 'Wizard Tower'],
  thumbnail: 'wizard-tower-night-thumb',
  layers: [
    {
      id: 'sky',
      shader: 'clouds',
      uniforms: {
        uSkyLowColor: [0.35, 0.12, 0.1],
        uSkyHighColor: [0.04, 0.05, 0.14],
        uCloudLightColor: [0.55, 0.45, 0.55],
        uCloudDarkColor: [0.1, 0.08, 0.16],
        uExposure: 0.9,
        uStepSize: 0.32,
        uCloudSpeed: 0.6,
        uCloudScale: 0.77,
        uDensity: 0.16,
        uCoverage: 0.6,
        uSoftness: 0.23,
      },
    },
    { id: 'wizard-tower-night', shader: 'image', source: wizardTowerNightPlate },
    // You, standing in the chamber.
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies Composite;
