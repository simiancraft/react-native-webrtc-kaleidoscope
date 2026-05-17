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
  s.source_files   = 'KaleidoscopeModule/**/*.{h,m,swift}'

  s.dependency 'ExpoModulesCore'

  # react-native-webrtc is a peer dependency. Its WebRTC.framework is
  # provided by the consumer's Podfile (auto-linked via the JS package) and
  # links into the final app. We do not declare it here, because doing so
  # would either pin a version (`s.dependency 'react-native-webrtc'`) or
  # mis-use system-framework linkage (`s.weak_framework 'WebRTC'`, which is
  # for OS-shipped frameworks). Swift `import WebRTC` from our sources
  # requires the consumer to enable modular headers for react-native-webrtc;
  # see README iOS integration notes.

  s.frameworks = 'CoreImage', 'CoreVideo', 'Metal', 'Vision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }
end
