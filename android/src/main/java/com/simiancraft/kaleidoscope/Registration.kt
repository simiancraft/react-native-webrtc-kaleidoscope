// Frame-processor registration for Android. Called from
// KaleidoscopeModule.OnCreate at Expo Module init time, before any track
// requests an effect by name. The Context is needed by GPU effects so they
// can read PNG assets for background-image and create RenderScript-style
// resources where applicable.

package com.simiancraft.kaleidoscope

import android.content.Context
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.simiancraft.kaleidoscope.effects.BackgroundImageFactory
import com.simiancraft.kaleidoscope.effects.BlurFactory
import com.simiancraft.kaleidoscope.effects.MirrorFactory
import com.simiancraft.kaleidoscope.gpu.GpuEffectFactory

object Registration {
  @JvmStatic
  fun registerAll(context: Context) {
    ProcessorProvider.addProcessor("mirror", MirrorFactory())
    ProcessorProvider.addProcessor("blur", BlurFactory(context))

    // Background-image variants — one factory per source preset. JS side
    // emits "background-image-{source}" so each preset gets its own
    // ProcessorProvider entry. Parameterized dispatch via uniforms lands
    // when we extend the upstream rn-webrtc API surface.
    ProcessorProvider.addProcessor(
      "background-image-office-1",
      BackgroundImageFactory(context, "office-1"),
    )
    ProcessorProvider.addProcessor(
      "background-image-office-2",
      BackgroundImageFactory(context, "office-2"),
    )

    // Temporary architecture-proof passthrough hook from the GPU bring-up.
    // Removed in the cleanup pass before v0.1 ships.
    ProcessorProvider.addProcessor("gpu-passthrough", GpuEffectFactory())
  }
}
