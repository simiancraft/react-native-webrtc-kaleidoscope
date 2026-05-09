// iOS mirror effect: CIImage.transformed(by: scaleX: -1, y: 1) → CIContext render
// → new RTCVideoFrame, preserving rotation and timestamp.
//
// Implementation lands in Commit 5 of bootstrap-and-ship-v0-1.md.

import Foundation
import CoreImage

// import WebRTC

public final class MirrorProcessor /* : RTCVideoFrameProcessor */ {
  // TODO(Commit 5): conform to the RTCVideoFrameProcessor protocol declared in
  // react-native-webrtc/ios/RCTWebRTC/videoEffects/VideoFrameProcessor.h.
  // Implement process(_:) to return a horizontally-flipped frame.
}
