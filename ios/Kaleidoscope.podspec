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
  s.platforms      = { :ios => '15.0' } # Apple Vision person segmentation requires iOS 15+
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

  # Bundled background-image presets (mirrors android/src/main/assets/
  # backgrounds/) plus the transpiled Metal shader SOURCE. Both are loaded at
  # runtime from the Kaleidoscope.bundle:
  #   - BackgroundImageProcessor resolves "office-1" -> office-1.png.
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
    ]
  }

  s.dependency 'ExpoModulesCore'

  # react-native-webrtc (or the @livekit/react-native-webrtc fork) is a peer
  # dependency. Its WebRTC.framework is provided by the consumer's Podfile
  # (auto-linked via the JS package) and links into the final app. We do not
  # declare it here, because doing so would either pin a version
  # (`s.dependency 'react-native-webrtc'`) or mis-use system-framework linkage
  # (`s.weak_framework 'WebRTC'`, which is for OS-shipped frameworks). Our Swift
  # imports the pod's videoEffects classes as a Clang module, which requires
  # modular headers on whichever fork is installed. The bundled config plugin
  # (app.plugin.js) detects the fork and patches the Podfile with
  #   pod '<react-native-webrtc | livekit-react-native-webrtc>', :modular_headers => true
  # automatically, so consumers using the plugin need no manual Podfile edit.
  # The library ships no bridging header.

  s.frameworks = 'CoreImage', 'CoreVideo', 'Metal', 'MetalKit', 'Vision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }
end
