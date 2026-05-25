// Frame-processor registration for iOS. Mirrors android/.../Registration.kt.
// Called from KaleidoscopeModule.OnCreate at Expo Module init time, before any
// JS code runs, so processors are in the upstream react-native-webrtc registry
// before any track requests an effect by name.
//
// Unlike Android (which registers a FACTORY and the upstream builds one
// processor per track), iOS registers a single processor INSTANCE per name.
// That instance's capturer:didCaptureVideoFrame: is invoked per frame, so each
// processor holds its own cached Metal/MediaPipe resources and is internally
// thread-safe (see each processor's os_unfair_lock).
//
// ProcessorProvider and the VideoFrameProcessorDelegate protocol come from
// react-native-webrtc's Obj-C sources, imported as a Clang module (the consumer
// enables `:modular_headers => true`; see Kaleidoscope.podspec and app.plugin.js).
// Two forks ship the same Obj-C class and protocol names under different module
// names, mirroring how android/build.gradle probes both Gradle projects:
//   - react-native-webrtc/react-native-webrtc -> module `react_native_webrtc`
//   - livekit/react-native-webrtc (@livekit/react-native) -> `livekit_react_native_webrtc`
// We import whichever is present; the symbols are identical either way. WebRTC
// types (RTCVideoFrame etc.) come from WebRTC.framework via `import WebRTC`.

import Foundation
import WebRTC
#if canImport(livekit_react_native_webrtc)
import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
import react_native_webrtc
#endif

public enum Registration {
  public static func registerAll() {
    // Geometric reorientation ops. flip-x is the corrected screen-horizontal
    // mirror that replaces the old "mirror" effect; the other three are new.
    // All four share TransformProcessor + transform.metalsrc; the buffer-space
    // rotation correction lives only in Orientation.swift.
    ProcessorProvider.addProcessor(TransformProcessor(op: .flipX), forName: "flip-x")
    ProcessorProvider.addProcessor(TransformProcessor(op: .flipY), forName: "flip-y")
    ProcessorProvider.addProcessor(TransformProcessor(op: .rotateCW), forName: "rotate-cw")
    ProcessorProvider.addProcessor(TransformProcessor(op: .rotateCCW), forName: "rotate-ccw")
    ProcessorProvider.addProcessor(BlurProcessor(), forName: "blur")
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "debug-resolutions"),
      forName: "background-image-debug-resolutions"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "dark-office"),
      forName: "background-image-dark-office"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "light-office"),
      forName: "background-image-light-office"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "home-light"),
      forName: "background-image-home-light"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "home-dark"),
      forName: "background-image-home-dark"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "nature-light"),
      forName: "background-image-nature-light"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "nature-dark"),
      forName: "background-image-nature-dark"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "stylized-light"),
      forName: "background-image-stylized-light"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "stylized-dark"),
      forName: "background-image-stylized-dark"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "simiancraft-light"),
      forName: "background-image-simiancraft-light"
    )
    ProcessorProvider.addProcessor(
      BackgroundImageProcessor(assetName: "simiancraft-dark"),
      forName: "background-image-simiancraft-dark"
    )
  }
}
