// Android blur effect: MLKit Selfie Segmentation + RenderScript / RenderEffect
// Gaussian blur + per-pixel composite of (blurred, original, mask).
//
// Implementation lands in Commit 10 of bootstrap-and-ship-v0-1.md.

package com.simiancraft.kaleidoscope.effects

// import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenter
// import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface

class BlurFactory /* : VideoFrameProcessorFactoryInterface */ {
  // TODO(Commit 10):
  //   1. VideoFrame buffer → RGBA bitmap.
  //   2. MLKit Selfie Segmentation in STREAM_MODE → confidence mask.
  //   3. Gaussian blur (RenderScript ScriptIntrinsicBlur sigma 25, or
  //      RenderEffect.createBlurEffect on API 31+ with platform fallback).
  //   4. Per-pixel mix(blurred, original, mask).
  //   5. Composite back to I420 VideoFrame, preserving rotation/timestamp.
}
