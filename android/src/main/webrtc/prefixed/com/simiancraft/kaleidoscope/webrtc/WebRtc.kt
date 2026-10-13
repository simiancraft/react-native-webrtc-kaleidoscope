// The WebRTC classes the effects use, resolved against whichever WebRTC build
// the consumer's react-native-webrtc links. android/build.gradle compiles
// exactly one of webrtc/prefixed and webrtc/unprefixed.
//
// @livekit/react-native-webrtc 144.2.0 and later link LiveKit's prefixed WebRTC build, which renames org.webrtc to livekit.org.webrtc.
package com.simiancraft.kaleidoscope.webrtc

typealias SurfaceTextureHelper = livekit.org.webrtc.SurfaceTextureHelper
typealias TextureBuffer = livekit.org.webrtc.VideoFrame.TextureBuffer
typealias TextureBufferImpl = livekit.org.webrtc.TextureBufferImpl
typealias TextureBufferType = livekit.org.webrtc.VideoFrame.TextureBuffer.Type
typealias VideoFrame = livekit.org.webrtc.VideoFrame
typealias YuvConverter = livekit.org.webrtc.YuvConverter
