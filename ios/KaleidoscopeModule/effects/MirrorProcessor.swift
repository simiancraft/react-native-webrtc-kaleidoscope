// iOS mirror effect.
//
// Planned shape: conform to the RTCVideoFrameProcessor protocol declared
// in react-native-webrtc/ios/RCTWebRTC/videoEffects/VideoFrameProcessor.h
// from an @objc-exposed subclass of NSObject; implement process(_:) to
// return a horizontally-flipped frame via
//   CIImage.transformed(by: CGAffineTransform(scaleX: -1, y: 1))
// rendered through a shared CIContext into a pooled CVPixelBuffer, then
// wrapped back into an RTCVideoFrame preserving rotation and timestamp.

import Foundation
import CoreImage

// import WebRTC

public final class MirrorProcessor /* : RTCVideoFrameProcessor */ {
}
