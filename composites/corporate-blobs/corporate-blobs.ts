// Corporate blobs: a dark-office backdrop, you composited over it, and large
// decorative edge/vignette blobs framing the frame on top (normal blend; the
// center stays clear so you read through). Each blob's color is its own uniform,
// so the eight-color brand palette is fully tunable; uColor grades them all
// together.
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<name>` instead.

import { darkOffice } from '../../images/dark-office/dark-office';
import type { Composite } from '../../src/kaleidoscope/types';

export const corporateBlobs = {
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
        uGlobalAlpha: 0.42,
        uScale: 4.15,
        uMinRing: 0.78,
        uMaxRing: 1.38,
        uEdgePull: 0.22,
        uCenterClear: 0.52,
        uCenterPush: 0.42,
        uMotionAmount: 1,
        uMotionSpeed: 1,
        uEdgeSoftness: 0.024,
      },
    },
  ],
} as const satisfies Composite;
