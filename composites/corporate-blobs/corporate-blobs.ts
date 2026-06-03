// Corporate blobs: a corporate-logo backdrop, you composited over it, and large
// decorative edge/vignette blobs framing the frame on top (normal blend; the
// center stays clear so you read through). Each blob's color is its own uniform,
// so the eight-color brand palette is fully tunable; uColor grades them all
// together.
//
// A packaged composite: within the library it imports its image layers
// relatively; a consumer would import from
// `react-native-webrtc-kaleidoscope/images/<name>` instead.

// Native variant. The thumbnail is the string id the prebuild plugin bundles
// `corporate-blobs.thumb.webp` as into the native app target;
// `resolveBackgroundUri` looks it up in Bundle.main. The web sibling
// (corporate-blobs.web.ts) keeps the `Asset.fromModule(...).uri` pattern;
// mirrors images/<id>/{<id>.ts,<id>.web.ts}.
import { corporateLogo } from '../../images/corporate-logo/corporate-logo';
import type { Composite } from '../../src/kaleidoscope/types';

export const corporateBlobs = {
  name: 'Blobs',
  taxonomy: ['Worlds', 'Corporate'],
  thumbnail: 'corporate-blobs-thumb',
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
        uEdgePull: 0.4,
        uCenterClear: 0.86,
        uMotionAmount: 1,
        uMotionSpeed: 2.61,
        uEdgeSoftness: 0.006,
      },
    },
  ],
} as const satisfies Composite;
