// Native entry point. Metro picks this up via package.json "react-native"
// and the "." subpath export's "react-native" condition.
//
// Implementation lands in Commit 7 of bootstrap-and-ship-v0-1.md.

import type { ApplyVideoEffects } from './types.js';

export type { ApplyVideoEffects, EffectName } from './types.js';

export const applyVideoEffects: ApplyVideoEffects = (_track, _names) => {
  throw new Error('kaleidoscope: applyVideoEffects (native) is not implemented yet (Commit 7)');
};
