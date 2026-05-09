// iOS blur effect: VNGeneratePersonSegmentationRequest → CIGaussianBlur → CIBlendWithMask
// → render back to RTCVideoFrame.
//
// Implementation lands in Commit 11 of bootstrap-and-ship-v0-1.md.

import Foundation
import CoreImage
import Vision

// import WebRTC

public final class BlurProcessor /* : RTCVideoFrameProcessor */ {
  // TODO(Commit 11):
  //   1. RTCVideoFrame buffer → CVPixelBuffer → CIImage.
  //   2. VNGeneratePersonSegmentationRequest (.fast; fall back to .balanced).
  //   3. CIFilter.gaussianBlur(inputRadius: 25) on a copy.
  //   4. CIBlendWithMask compositing original over blurred via mask.
  //   5. Render to RTCVideoFrame, preserving rotation/timestamp.
}
