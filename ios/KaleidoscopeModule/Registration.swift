// Frame-processor registration for iOS.
// Maps effect names to their RTCVideoFrameProcessor implementations in the
// upstream react-native-webrtc registry.
//
// Implementations land in Commit 5 (mirror) and Commit 11 (blur) of
// bootstrap-and-ship-v0-1.md.

import Foundation

// import WebRTC

public enum Registration {
  public static func registerAll() {
    // TODO(Commit 5):  ProcessorProvider.addProcessor("mirror", MirrorProcessor())
    // TODO(Commit 11): ProcessorProvider.addProcessor("blur",   BlurProcessor())
  }
}
