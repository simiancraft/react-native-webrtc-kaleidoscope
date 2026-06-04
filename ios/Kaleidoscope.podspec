require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'Kaleidoscope'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '15.0' } # Metal effect pipeline + Expo modules floor; MediaPipeTasksVision needs iOS 12+
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/simiancraft/react-native-webrtc-kaleidoscope.git', :tag => "v#{s.version}" }
  # Note: the transpiled shader sources are intentionally NOT globbed into
  # source_files, AND they use a custom `.metalsrc` extension instead of
  # `.metal`. Both halves of that constraint are load-bearing:
  #
  #   (a) All three transpiled shaders (passthrough, blur, composite) export
  #       the entry point `main0` because spirv-cross emits `main0` for every
  #       stage. Three identical symbols cannot coexist in one metallib.
  #   (b) Excluding them from source_files prevents the main target's default
  #       metallib from compiling and colliding on `main0`.
  #   (c) Renaming the extension from `.metal` to `.metalsrc` prevents Xcode's
  #       MetalCompile build phase on the resource_bundles target (below) from
  #       compiling them into a `default.metallib` inside Kaleidoscope.bundle
  #       and hitting the exact same duplicate-symbol collision at link time
  #       (air-lld errors). Xcode only recognises `.metal` as a compilable
  #       Metal source; `.metalsrc` is treated as opaque data and copied as-is.
  #   (d) The Swift loader (ShaderLibrary.swift) reads each `.metalsrc` file
  #       as TEXT via String(contentsOf:) and compiles it into its own
  #       standalone MTLLibrary via device.makeLibrary(source:) at runtime,
  #       so each `main0` stays in its own namespace.
  s.source_files   = 'KaleidoscopeModule/**/*.{h,m,swift}'

  # Bundled image plates (mirrors android/src/main/assets/images/) plus the
  # transpiled Metal shader SOURCE. Both are loaded at runtime from the
  # Kaleidoscope.bundle:
  #   - BundledImage resolves "dark-office" -> dark-office.webp (shared by
  #     resolveImageUri and the composite's image layers).
  #   - ShaderLibrary reads passthrough/blur/composite.metalsrc as TEXT and
  #     compiles each into its own MTLLibrary via makeLibrary(source:). The
  #     `.metalsrc` extension (not `.metal`) is required so Xcode's
  #     MetalCompile build phase does not auto-compile them into a
  #     `default.metallib` inside the bundle and hit the same `main0`
  #     duplicate-symbol collision the source_files exclusion already avoids
  #     for the main target. Per-file runtime compilation keeps each `main0`
  #     in its own namespace and survives transpiler regeneration.
  s.resource_bundles = {
    'Kaleidoscope' => [
      'KaleidoscopeModule/resources/**/*',
      'KaleidoscopeModule/shaders/*.metalsrc',
      # The generative-shader name list (codegen) so registration is data-driven.
      'KaleidoscopeModule/shaders/GENERATIVE.txt',
    ]
  }

  s.dependency 'ExpoModulesCore'

  # Person segmentation via MediaPipe Tasks ImageSegmenter, replacing Apple
  # Vision. Pinned to EXACTLY 0.10.14 to match Android's
  # com.google.mediapipe:tasks-vision:0.10.14 (same model family, same
  # confidence-mask API shape) so all three platforms run identical
  # segmentation. The exact pin (not `~> 0.10`) is deliberate: the pessimistic
  # range floats to the newest 0.10.x, and MediaPipeTasksVision 0.10.33+ ships
  # an XCFramework structure with known CocoaPods linking problems; 0.10.14 is
  # the known-good version the RN ecosystem standardizes on. The
  # selfie_segmenter.tflite model ships in the Kaleidoscope.bundle
  # resource_bundles glob below (resources/**/*).
  s.dependency 'MediaPipeTasksVision', '0.10.14'

  # Fork-resolving dependency on react-native-webrtc. The Kaleidoscope target
  # needs FRAMEWORK_SEARCH_PATHS pointing at WebRTC.framework so the Swift
  # `import WebRTC` in Registration.swift, FrameBridge.swift, and the three
  # Processor files resolves at compile time. We do not declare the framework
  # directly (it is not OS-shipped, so `s.weak_framework` is wrong; and it is
  # vended by two different forks at two different paths). Instead we depend
  # on whichever rn-webrtc fork the consumer installed, and CocoaPods
  # propagates the framework search paths transitively through the
  # `Kaleidoscope -> <fork> -> <fork's WebRTC framework>` dependency edge via
  # the inherited xcconfig chain.
  #
  # Ordering MUST stay LiveKit-first to match (a) app.plugin.js:resolveWebrtcPod
  # (LiveKit fork preferred when both are installed) and (b) the Swift
  # `#if canImport(livekit_react_native_webrtc)` chains in Registration.swift
  # and the three Processor files. Android's build.gradle is upstream-first
  # (pre-existing inconsistency, tracked separately); do NOT mirror Android
  # here; the iOS Swift code unconditionally imports the LiveKit module first
  # when present, and the chosen dependency must match what Swift imports.
  #
  # The plugin's `pod ... :modular_headers => true` Podfile patch
  # (app.plugin.js) is still required and is NOT subsumed by this dependency:
  # modular_headers can only be requested at the Podfile declaration site, not
  # via a podspec dependency edge. The two declarations of the same pod merge
  # in CocoaPods' dependency graph.
  #
  # `__dir__` here is `<consumer>/node_modules/react-native-webrtc-kaleidoscope/
  # ios/` at pod-install time, so `../../@livekit/react-native-webrtc`
  # resolves to `<consumer>/node_modules/@livekit/react-native-webrtc`;
  # the same probe app.plugin.js performs at `:117`.
  livekit_fork_path = File.expand_path('../../@livekit/react-native-webrtc', __dir__)
  if File.directory?(livekit_fork_path)
    s.dependency 'livekit-react-native-webrtc'
  else
    s.dependency 'react-native-webrtc'
  end

  # Segmentation moved from Apple Vision to MediaPipeTasksVision (declared as a
  # pod dependency above), so the Vision system framework is no longer linked.
  s.frameworks = 'CoreImage', 'CoreVideo', 'Metal', 'MetalKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }
end
