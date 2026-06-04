// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is wizard-tower.ts (no thumbnail). Mirrors images/<id>/{<id>.ts,<id>.web.ts}.

import { Asset } from 'expo-asset';
import type { KaleidoscopePreset } from '../../../src/kaleidoscope.preset-book.types';
import { wizardTower1 } from '../../images/wizard-tower/wizard-tower-1';
import wizardTowerThumb from './wizard-tower.thumb.webp';

export const wizardTower = {
  name: 'Wizard Tower',
  taxonomy: ['Worlds', 'Wizard Tower'],
  thumbnail: Asset.fromModule(wizardTowerThumb).uri,
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
    { id: 'wizard-tower-1', shader: 'image', source: wizardTower1 },
    // You, standing in the chamber.
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies KaleidoscopePreset;
