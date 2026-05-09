// Frame-processor registration for Android.
// Maps effect names to their VideoFrameProcessorFactoryInterface implementations
// in the upstream react-native-webrtc registry.
//
// Implementations land in Commit 4 (mirror) and Commit 10 (blur) of
// bootstrap-and-ship-v0-1.md.

package com.simiancraft.kaleidoscope

// import com.oney.WebRTCModule.videoEffects.ProcessorProvider
// import com.simiancraft.kaleidoscope.effects.MirrorFactory
// import com.simiancraft.kaleidoscope.effects.BlurFactory

object Registration {
  @JvmStatic
  fun registerAll() {
    // TODO(Commit 4):  ProcessorProvider.addProcessor("mirror", MirrorFactory())
    // TODO(Commit 10): ProcessorProvider.addProcessor("blur",   BlurFactory())
  }
}
