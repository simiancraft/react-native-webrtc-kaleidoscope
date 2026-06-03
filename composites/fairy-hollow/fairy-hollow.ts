// Fairy hollow: a grand-portal root-cave variant of fairy-cave. A bright sky
// through the large round opening, the hollow plate, cool fireflies drifting on
// top, you in the cave. A variation of fairy-cave with the clouds `sky`
// brightened further and the fireflies color-shifted cool to read against the
// near-white portal.
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<name>` instead.

// Native variant. The thumbnail is the string id the prebuild plugin bundles
// `fairy-hollow.thumb.webp` as into the native app target; `resolveBackgroundUri`
// looks it up in Bundle.main. The web sibling keeps the `Asset.fromModule` path.
import { fairyHollow as fairyHollowPlate } from '../../images/fairy-hollow/fairy-hollow';
import type { Composite } from '../../src/kaleidoscope/types';

export const fairyHollow = {
  name: 'Hollow',
  taxonomy: ['Worlds', 'Fairy Cave'],
  thumbnail: 'fairy-hollow-thumb',
  layers: [
    {
      id: 'sky',
      shader: 'clouds',
      uniforms: {
        uSkyLowColor: [0.92, 0.9, 0.85],
        uSkyHighColor: [0.7, 0.8, 0.92],
        uCloudLightColor: [1.0, 1.0, 0.98],
        uCloudDarkColor: [0.78, 0.8, 0.85],
        uExposure: 1.4,
        uStepSize: 0.38,
        uCloudSpeed: 0.35,
        uCloudScale: 1.3,
        uDensity: 0.04,
        uCoverage: 0.7,
        uSoftness: 0.2,
      },
    },
    { id: 'fairy-hollow', shader: 'image', source: fairyHollowPlate },
    {
      id: 'fireflies',
      shader: 'fireflies',
      blend: 'additive',
      uniforms: {
        uGlowSize: 0.025,
        uDotSize: 0.004,
        uSpeed: 0.18,
        uTwinkle: 1.6,
        uColor: [0.65, 0.85, 1.0],
      },
    },
    // You, in the cave (fireflies drifting behind you).
    { id: 'you', shader: 'direct', target: 'subject' },
  ],
} as const satisfies Composite;
