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

  # react-native-webrtc is a peer dependency. Its pod is provided by the
  # consumer's app and links automatically when present in the build graph.
  s.weak_framework = 'WebRTC'

  s.frameworks = 'CoreImage', 'CoreVideo', 'Vision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }
end
