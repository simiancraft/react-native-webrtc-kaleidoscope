// Frame-processor registration for Android. Called from
// KaleidoscopeModule.OnCreate at Expo Module init time, before any track
// requests an effect by name. The Context is needed by BlurFactory for
// RenderScript construction.

package com.simiancraft.kaleidoscope

import android.content.Context
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.simiancraft.kaleidoscope.effects.BlurFactory
import com.simiancraft.kaleidoscope.effects.MirrorFactory

object Registration {
  @JvmStatic
  fun registerAll(context: Context) {
    ProcessorProvider.addProcessor("mirror", MirrorFactory())
    ProcessorProvider.addProcessor("blur", BlurFactory(context))
  }
}
