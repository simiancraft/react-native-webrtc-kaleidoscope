// The WebRTC classes the effects use, resolved against whichever WebRTC build
// the consumer's react-native-webrtc links. android/build.gradle compiles
// exactly one of webrtc/prefixed and webrtc/unprefixed.
//
// Upstream react-native-webrtc and @livekit/react-native-webrtc before 144.2.0 ship WebRTC under org.webrtc.
package com.simiancraft.kaleidoscope.webrtc

typealias SurfaceTextureHelper = org.webrtc.SurfaceTextureHelper
typealias TextureBuffer = org.webrtc.VideoFrame.TextureBuffer
typealias TextureBufferImpl = org.webrtc.TextureBufferImpl
typealias TextureBufferType = org.webrtc.VideoFrame.TextureBuffer.Type
typealias VideoFrame = org.webrtc.VideoFrame
typealias YuvConverter = org.webrtc.YuvConverter
