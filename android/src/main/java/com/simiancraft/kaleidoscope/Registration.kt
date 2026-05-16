// Frame-processor registration for Android. Called from
// KaleidoscopeModule.OnCreate at Expo Module init time, before any track
// requests an effect by name. The Context is needed by BlurFactory for
// RenderScript construction.

package com.simiancraft.kaleidoscope

import android.content.Context
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.simiancraft.kaleidoscope.effects.BlurFactory
import com.simiancraft.kaleidoscope.effects.MirrorFactory
import com.simiancraft.kaleidoscope.gpu.GpuEffectFactory

object Registration {
  @JvmStatic
  fun registerAll(context: Context) {
    ProcessorProvider.addProcessor("mirror", MirrorFactory())
    ProcessorProvider.addProcessor("blur", BlurFactory(context))
    // PLAN.md Commit 3 manual-test hook; removed in the cleanup pass before
    // shipping. Lets us verify the GPU pipeline by name from the demo.
    ProcessorProvider.addProcessor("gpu-passthrough", GpuEffectFactory())
  }
}
