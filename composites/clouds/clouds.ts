// Sky: raymarched daytime clouds with you composited over them. Fully
// procedural; no image layer.
//
// A packaged composite consumers can list by importing this module.

import type { Composite } from '../../src/kaleidoscope/types';

export const clouds = {
  name: 'Daytime',
  taxonomy: ['Sky'],
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
} as const satisfies Composite;
