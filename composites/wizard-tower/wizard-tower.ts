// Wizard tower: sunset clouds visible through the chamber's cut-out sky, the
// tower plate composited on top, you standing in the chamber.
//
// A packaged composite: an ordered painter's stack of layers under one name,
// with display metadata. The library ships it so a consuming book can list it by
// importing this module; consumers copy this file's shape to author their own.
// Within the library it imports its image layers relatively; a consumer would
// import from `react-native-webrtc-kaleidoscope/images/<name>` instead.

import { wizardsTower } from '../../images/wizards-tower/wizards-tower';
import type { Composite } from '../../src/kaleidoscope/types';

export const wizardTower = {
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
} as const satisfies Composite;
