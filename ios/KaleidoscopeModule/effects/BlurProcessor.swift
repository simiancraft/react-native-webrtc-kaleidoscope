// iOS blur effect.
//
// Planned shape (mirrors android/.../effects/BlurFactory.kt + gpu/Mask.kt):
//   1. RTCVideoFrame buffer (RTCCVPixelBuffer) -> CVPixelBuffer -> CIImage.
//   2. VNGeneratePersonSegmentationRequest (qualityLevel: .fast) on a
//      dedicated serial DispatchQueue with an NSLock-guarded inFlight flag
//      and lastMask cache; the capture thread always uses the most recent
//      completed mask and kicks off a new segmentation only when the
//      worker is idle.
//   3. CIFilter.gaussianBlur(inputRadius: 25) on a copy of the input.
//   4. CIBlendWithMask compositing original over blurred via the mask.
//   5. Render through a shared CIContext into a pooled CVPixelBuffer
//      (kCVPixelBufferIOSurfacePropertiesKey: [:],
//      kCVPixelBufferMetalCompatibilityKey: true), then wrap back into an
//      RTCVideoFrame preserving rotation and timestamp.

import Foundation
import CoreImage
import Vision

// import WebRTC

public final class BlurProcessor /* : RTCVideoFrameProcessor */ {
}
