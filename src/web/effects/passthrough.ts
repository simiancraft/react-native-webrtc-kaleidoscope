// Identity FrameTransform — emits the input frame unchanged.
//
// Exists only to satisfy the exhaustiveness check on `Record<EffectName,
// FrameTransform>` for the temporary native `gpu-passthrough` test hook
// (PLAN.md Commit 3). Removed in the cleanup pass with the rest of the
// gpu-passthrough scaffolding.

import type { FrameTransform } from '../insertable-streams';

export const passthrough: FrameTransform = async (frame) => {
  const out = new VideoFrame(frame, {
    timestamp: frame.timestamp,
    ...(frame.duration != null ? { duration: frame.duration } : {}),
  });
  frame.close();
  return out;
};
