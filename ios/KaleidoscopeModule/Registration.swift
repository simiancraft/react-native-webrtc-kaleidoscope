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
// The registry is now just TWO things (the effect-unification collapse, Phase C):
//   - the four geometric transform ops (flip-x/flip-y/rotate-cw/rotate-ccw),
//     sharing one TransformProcessor + transform.metalsrc, and
//   - one "composite" compositor (CompositeProcessor): EVERY art effect — images,
//     blur, generative shaders, masked subjects — is now a LAYER inside a
//     composite, delivered out-of-band via setCompositeLayers (CompositeLayers) and
//     composited per frame. The per-effect art processors (background-image-<id>,
//     the bare generative names, blur) and their data-driven registration are
//     gone; adding a preset is pure JS (a new Composite in the book), no Swift
//     change and no native registration. Mirrors android/.../Registration.kt
//     registering only the transforms + CompositeFactory under "composite".
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
import os.log
#if canImport(livekit_react_native_webrtc)
import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
import react_native_webrtc
#endif

public enum Registration {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Registration")

  public static func registerAll() {
    // Geometric reorientation ops. flip-x is the corrected screen-horizontal
    // mirror that replaces the old "mirror" effect; the other three are new.
    // All four share TransformProcessor + transform.metalsrc; the buffer-space
    // rotation correction lives only in Orientation.swift. The registry-parity
    // test pins these literals plus "composite".
    ProcessorProvider.addProcessor(TransformProcessor(op: .flipX), forName: "flip-x")
    ProcessorProvider.addProcessor(TransformProcessor(op: .flipY), forName: "flip-y")
    ProcessorProvider.addProcessor(TransformProcessor(op: .rotateCW), forName: "rotate-cw")
    ProcessorProvider.addProcessor(TransformProcessor(op: .rotateCCW), forName: "rotate-ccw")

    // One composite compositor serves EVERY art effect; the active layer stack is
    // data, delivered out-of-band via setCompositeLayers (CompositeLayers) and read per
    // frame. A single registered instance, like the transform processors. Mirrors
    // android/.../Registration.kt registering CompositeFactory under "composite".
    ProcessorProvider.addProcessor(CompositeProcessor(), forName: "composite")

    os_log("registered 4 transform op(s) + 1 composite compositor", log: log, type: .info)
  }
}
