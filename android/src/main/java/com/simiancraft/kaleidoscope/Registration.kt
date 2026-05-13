// Frame-processor registration for Android. Called from
// KaleidoscopeModule.OnCreate at Expo Module init time, before any track
// requests an effect by name.

package com.simiancraft.kaleidoscope

import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.simiancraft.kaleidoscope.effects.MirrorFactory

object Registration {
  @JvmStatic
  fun registerAll() {
    ProcessorProvider.addProcessor("mirror", MirrorFactory())
    // TODO(Commit 10): ProcessorProvider.addProcessor("blur", BlurFactory())
  }
}
