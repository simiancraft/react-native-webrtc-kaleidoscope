// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is wizard-tower-night.ts (no thumbnail).

import { Asset } from 'expo-asset';
import { wizardTowerNight as wizardTowerNightPlate } from '../../images/wizard-tower/wizard-tower-night';
import type { Composite } from '../../src/kaleidoscope/types';
import wizardTowerNightThumb from './wizard-tower-night.thumb.webp';

export const wizardTowerNight = {
  name: 'Night',
  taxonomy: ['Worlds', 'Wizard Tower'],
  thumbnail: Asset.fromModule(wizardTowerNightThumb).uri,
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
