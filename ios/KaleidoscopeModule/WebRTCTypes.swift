// The WebRTC types the effects use, resolved against whichever WebRTC framework
// the consumer's react-native-webrtc links.
//
// @livekit/react-native-webrtc 144.2.0 and later link LiveKitWebRTC, LiveKit's
// prefixed build: the module is renamed and every Objective-C class gains an LK
// prefix (LKRTCVideoFrame). These aliases restore the unprefixed names, so the
// effect code reads the same against either framework. Upstream
// react-native-webrtc and earlier LiveKit releases link WebRTC, unprefixed.
#if canImport(LiveKitWebRTC)
    import LiveKitWebRTC

    public typealias RTCCVPixelBuffer = LKRTCCVPixelBuffer
    public typealias RTCVideoCapturer = LKRTCVideoCapturer
    public typealias RTCVideoFrame = LKRTCVideoFrame
#endif
