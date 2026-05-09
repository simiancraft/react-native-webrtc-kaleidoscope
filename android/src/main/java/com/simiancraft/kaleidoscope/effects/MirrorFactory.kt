// Android mirror effect: per-row reverse on the I420 Y plane,
// chroma planes reversed in U,V pairs at half resolution.
// Preserves rotation and timestamp.
//
// Implementation lands in Commit 4 of bootstrap-and-ship-v0-1.md.

package com.simiancraft.kaleidoscope.effects

// import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface

class MirrorFactory /* : VideoFrameProcessorFactoryInterface */ {
  // TODO(Commit 4): implement VideoFrameProcessorFactoryInterface and return a
  // processor whose process() flips I420 buffers horizontally.
}
