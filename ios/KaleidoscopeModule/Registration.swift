// Frame-processor registration for iOS.
// Mirrors android/.../Registration.kt: maps effect names to their
// RTCVideoFrameProcessor implementations in the upstream react-native-webrtc
// registry. Called from KaleidoscopeModule.OnCreate, before any JS code runs.
//
// Implementations are not yet ported. Until they land, this is a no-op and
// the JS facade (src/index.ts) gates NATIVE_REGISTERED_EFFECTS on Platform.OS
// so iOS consumers do not reach an empty processor list (which the upstream
// rn-webrtc registry mishandles).

import Foundation

// import WebRTC

public enum Registration {
  public static func registerAll() {
    // ProcessorProvider.addProcessor("mirror", MirrorProcessor())
    // ProcessorProvider.addProcessor("blur",   BlurProcessor())
  }
}
