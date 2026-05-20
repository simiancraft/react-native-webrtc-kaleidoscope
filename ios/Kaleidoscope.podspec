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
  # Note: .metal is intentionally NOT globbed into source_files. All three
  # transpiled shaders export the entry point `main0` (spirv-cross emits that
  # for every stage); compiling them into the default metallib would collide
  # on that duplicate symbol and fail the build. They ship as bundle resources
  # instead and are compiled per-file at runtime via makeLibrary(source:).
  s.source_files   = 'KaleidoscopeModule/**/*.{h,m,swift}'

  # Bundled background-image presets (mirrors android/src/main/assets/
  # backgrounds/) plus the transpiled Metal shader SOURCE. Both are loaded at
  # runtime from the Kaleidoscope.bundle:
  #   - BackgroundImageProcessor resolves "office-1" -> office-1.png.
  #   - ShaderLibrary reads passthrough/blur/composite.metal as TEXT and
  #     compiles each into its own MTLLibrary via makeLibrary(source:). This
  #     is required because all three shaders export the entry point `main0`
  #     (spirv-cross emits that for every stage), so they cannot share a
  #     single metallib; per-file runtime compilation keeps each `main0` in
  #     its own namespace and survives transpiler regeneration.
  s.resource_bundles = {
    'Kaleidoscope' => [
      'KaleidoscopeModule/resources/**/*',
      'KaleidoscopeModule/shaders/*.metal',
    ]
  }

  s.dependency 'ExpoModulesCore'

  # react-native-webrtc is a peer dependency. Its WebRTC.framework is
  # provided by the consumer's Podfile (auto-linked via the JS package) and
  # links into the final app. We do not declare it here, because doing so
  # would either pin a version (`s.dependency 'react-native-webrtc'`) or
  # mis-use system-framework linkage (`s.weak_framework 'WebRTC'`, which is
  # for OS-shipped frameworks). Swift `import WebRTC` from our sources
  # requires the consumer to enable modular headers for react-native-webrtc
  # in their Podfile, either via
  #   pod 'react-native-webrtc', :modular_headers => true
  # or a global `use_modular_headers!`. The library ships no bridging header.

  s.frameworks = 'CoreImage', 'CoreVideo', 'Metal', 'MetalKit', 'Vision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }
end
