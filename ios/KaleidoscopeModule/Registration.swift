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
// Registration is DIRECTORY- and DATA-driven, not hardcoded (mirrors
// Registration.kt):
//   - blur and the four geometric transforms stay statically named (the only
//     fixed effect names; the registry-parity test pins these literals).
//   - background-image-<id> registers one BackgroundImageProcessor per id in
//     the prebuild-written manifest (kaleidoscope-backgrounds.json in the app
//     bundle; see app.plugin.js's iOS dangerous mod). The prebuild curates which
//     presets ship per consumer, so the manifest enumerates exactly those; adding
//     or dropping a preset needs no Swift change. The matching <id>.webp is also
//     copied into the app bundle by the same mod (BackgroundImageProcessor now
//     searches Bundle.main in addition to Kaleidoscope.bundle).
//   - the bare generative-shader name (e.g. "plasma") registers one generic
//     ShaderProcessor per line in GENERATIVE.txt (codegen, in the Kaleidoscope
//     bundle). Adding a generative .frag (which regenerates GENERATIVE.txt and
//     transpiles a new .metalsrc) registers with no Swift change.
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

  // The prebuild-written background manifest: a JSON array of preset ids whose
  // <id>.webp the iOS dangerous mod copied into the app bundle. Mirrors Android
  // enumerating assets/backgrounds.
  private static let backgroundManifestName = "kaleidoscope-backgrounds"
  private static let backgroundManifestExtension = "json"

  public static func registerAll() {
    // Geometric reorientation ops. flip-x is the corrected screen-horizontal
    // mirror that replaces the old "mirror" effect; the other three are new.
    // All four share TransformProcessor + transform.metalsrc; the buffer-space
    // rotation correction lives only in Orientation.swift. These literal names
    // are the only statically registered effects (the registry-parity test pins
    // "flip-x"/"flip-y"/"rotate-cw"/"rotate-ccw"/"blur").
    ProcessorProvider.addProcessor(TransformProcessor(op: .flipX), forName: "flip-x")
    ProcessorProvider.addProcessor(TransformProcessor(op: .flipY), forName: "flip-y")
    ProcessorProvider.addProcessor(TransformProcessor(op: .rotateCW), forName: "rotate-cw")
    ProcessorProvider.addProcessor(TransformProcessor(op: .rotateCCW), forName: "rotate-ccw")
    ProcessorProvider.addProcessor(BlurProcessor(), forName: "blur")

    registerBackgroundImages()
    registerGenerativeShaders()
  }

  // Register one BackgroundImageProcessor per id in the prebuild-written
  // manifest. JS emits "background-image-<id>"; registering exactly the ids the
  // manifest lists is the point (the prebuild curates them). A missing manifest
  // is normal (a consumer that ships no presets, or a build predating the mod)
  // and must not crash registration.
  private static func registerBackgroundImages() {
    guard let ids = loadBackgroundManifest() else {
      os_log("no background manifest found; skipping background-image effects",
             log: log, type: .info)
      return
    }
    for id in ids {
      ProcessorProvider.addProcessor(
        BackgroundImageProcessor(assetName: id),
        forName: "background-image-\(id)"
      )
    }
    os_log("registered %d background-image preset(s)", log: log, type: .info, ids.count)
  }

  // Read kaleidoscope-backgrounds.json (a JSON array of strings) from the app
  // bundle, where the iOS dangerous mod wrote it. Returns nil on any
  // missing/unreadable/malformed file so registration degrades gracefully.
  private static func loadBackgroundManifest() -> [String]? {
    // The mod adds the manifest to the APP target's resources, so it lands in
    // Bundle.main. Fall back to the module's own bundle for a test/static layout.
    let bundles = [Bundle.main, Bundle(for: BackgroundImageProcessor.self)]
    for bundle in bundles {
      guard let url = bundle.url(
        forResource: backgroundManifestName, withExtension: backgroundManifestExtension
      ) else { continue }
      do {
        let data = try Data(contentsOf: url)
        let parsed = try JSONSerialization.jsonObject(with: data)
        if let ids = parsed as? [String] {
          return ids
        }
        os_log("background manifest %{public}@.json is not a string array; ignoring",
               log: log, type: .error, backgroundManifestName)
        return nil
      } catch {
        os_log("background manifest read/parse failed: %{public}@",
               log: log, type: .error, error.localizedDescription)
        return nil
      }
    }
    return nil
  }

  // Register one generic ShaderProcessor per generative shader named in
  // GENERATIVE.txt (codegen; one name per line). The effect name is the bare
  // shader name (e.g. "plasma"); JS targets its uniforms via
  // setShaderUniforms(name, ...). Mirrors registerGenerativeShaders in
  // Registration.kt iterating ShadersGenerated.GENERATIVE.
  private static func registerGenerativeShaders() {
    let names = loadGenerativeNames()
    for name in names {
      ProcessorProvider.addProcessor(ShaderProcessor(forName: name), forName: name)
    }
    os_log("registered %d generative shader(s)", log: log, type: .info, names.count)
  }

  // Read GENERATIVE.txt (one shader name per line) from the Kaleidoscope bundle.
  // The codegen + podspec resource_bundles glob ship it there. Blank lines are
  // ignored. A missing file is non-fatal (no generative shaders registered).
  private static func loadGenerativeNames() -> [String] {
    let containing = Bundle(for: BackgroundImageProcessor.self)
    let resourceBundle = Bundle.kaleidoscopeResources(relativeTo: containing) ?? containing
    guard let url = resourceBundle.url(forResource: "GENERATIVE", withExtension: "txt")
      ?? resourceBundle.url(forResource: "GENERATIVE", withExtension: "txt", subdirectory: "shaders")
    else {
      os_log("GENERATIVE.txt not found in bundle; no generative shaders registered",
             log: log, type: .info)
      return []
    }
    do {
      let text = try String(contentsOf: url, encoding: .utf8)
      return text
        .split(whereSeparator: { $0 == "\n" || $0 == "\r" })
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
    } catch {
      os_log("GENERATIVE.txt read failed: %{public}@", log: log, type: .error,
             error.localizedDescription)
      return []
    }
  }
}
