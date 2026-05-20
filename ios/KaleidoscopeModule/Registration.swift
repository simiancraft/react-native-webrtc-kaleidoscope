// Frame-processor registration for iOS. Mirrors android/.../Registration.kt.
// Called from KaleidoscopeModule.OnCreate at Expo Module init time, before any
// JS code runs, so processors are in the upstream react-native-webrtc registry
// before any track requests an effect by name.
//
// Unlike Android (which registers a FACTORY and the upstream builds one
// processor per track), iOS registers a single processor INSTANCE per name.
// That instance's capturer:didCaptureVideoFrame: is invoked per frame, so each
// processor holds its own cached Metal/Vision resources and is internally
// thread-safe (see each processor's os_unfair_lock).
//
// ProcessorProvider and the VideoFrameProcessorDelegate protocol come from
// react-native-webrtc's Obj-C sources. They are imported as a Clang module:
// the consumer enables `pod 'react-native-webrtc', :modular_headers => true`
// (documented in Kaleidoscope.podspec), which makes the pod's public headers
// importable as the `react_native_webrtc` module. WebRTC types (RTCVideoFrame
// etc.) come from WebRTC.framework via `import WebRTC`.

import Foundation
import WebRTC
import react_native_webrtc

public enum Registration {
  public static func registerAll() {
    ProcessorProvider.addProcessor(MirrorProcessor(), forName: "mirror")
    ProcessorProvider.addProcessor(BlurProcessor(), forName: "blur")
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "office-1"),
      forName: "background-image-office-1"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "office-2"),
      forName: "background-image-office-2"
    )
  }
}
