// Web variant. Resolves the thumbnail URI via expo-asset at module-load time.
// Native is corporate-blobs.ts (no thumbnail).
// Mirrors images/<id>/{<id>.ts,<id>.web.ts}.

import { Asset } from 'expo-asset';
import { corporateLogo } from '../../images/corporate-logo/corporate-logo';
import type { Composite } from '../../src/kaleidoscope/types';
import corporateBlobsThumb from './corporate-blobs.thumb.webp';

export const corporateBlobs = {
  name: 'Corporate Blobs',
  category: 'Worlds',
  thumbnail: Asset.fromModule(corporateBlobsThumb).uri,
  layers: [
    { id: 'corporate-logo', shader: 'image', source: corporateLogo },
    // You, in front of the logo (blobs frame you from the edges, on top).
    { id: 'you', shader: 'direct', target: 'subject' },
    {
      id: 'blobs',
      shader: 'corporate-blobs',
      blend: 'normal',
      uniforms: {
        uColor: [0.96, 0.71, 1],
        uBlobColor1: [0.376, 0.647, 0.98],
        uBlobColor2: [0.063, 0.725, 0.506],
        uBlobColor3: [0.984, 0.749, 0.141],
        uBlobColor4: [0.976, 0.451, 0.086],
        uBlobColor5: [0.133, 0.773, 0.369],
        uBlobColor6: [0.851, 0.275, 0.937],
        uBlobColor7: [0.341, 0.325, 0.306],
        uBlobColor8: [0.008, 0.518, 0.78],
        uGlobalAlpha: 0.75,
        uScale: 2.26,
        uMinRing: 0.78,
        uMaxRing: 1.38,
        uEdgePull: 0.4,
        uCenterClear: 0.86,
        uCenterPush: 0.42,
        uMotionAmount: 1,
        uMotionSpeed: 2.61,
        uEdgeSoftness: 0.006,
      },
    },
  ],
} as const satisfies Composite;
