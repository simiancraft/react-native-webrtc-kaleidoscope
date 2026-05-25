// Frame-processor registration for Android. Called from
// KaleidoscopeModule.OnCreate at Expo Module init time, before any track
// requests an effect by name. The Context is needed by GPU effects so they
// can read WebP assets for background-image and create RenderScript-style
// resources where applicable.

package com.simiancraft.kaleidoscope

import android.content.Context
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.simiancraft.kaleidoscope.effects.BackgroundImageFactory
import com.simiancraft.kaleidoscope.effects.BlurFactory
import com.simiancraft.kaleidoscope.effects.TransformFactory
import com.simiancraft.kaleidoscope.gpu.Orientation

object Registration {
  @JvmStatic
  fun registerAll(context: Context) {
    ProcessorProvider.addProcessor("blur", BlurFactory(context))

    // Geometric reorientation effects. flip-x is the corrected screen-horizontal
    // mirror (replaces the old "mirror" CPU effect). The rotation correction
    // lives entirely in Orientation.kt; each registration just names its op.
    ProcessorProvider.addProcessor("flip-x", TransformFactory(Orientation.Op.FLIP_X))
    ProcessorProvider.addProcessor("flip-y", TransformFactory(Orientation.Op.FLIP_Y))
    ProcessorProvider.addProcessor("rotate-cw", TransformFactory(Orientation.Op.ROTATE_CW))
    ProcessorProvider.addProcessor("rotate-ccw", TransformFactory(Orientation.Op.ROTATE_CCW))

    // Background-image variants — one factory per source preset. JS side
    // emits "background-image-{source}" so each preset gets its own
    // ProcessorProvider entry. Parameterized dispatch via uniforms lands
    // when we extend the upstream rn-webrtc API surface.
    ProcessorProvider.addProcessor(
      "background-image-debug-resolutions",
      BackgroundImageFactory(context, "debug-resolutions"),
    )
    ProcessorProvider.addProcessor(
      "background-image-dark-office",
      BackgroundImageFactory(context, "dark-office"),
    )
    ProcessorProvider.addProcessor(
      "background-image-light-office",
      BackgroundImageFactory(context, "light-office"),
    )
    ProcessorProvider.addProcessor(
      "background-image-home-light",
      BackgroundImageFactory(context, "home-light"),
    )
    ProcessorProvider.addProcessor(
      "background-image-home-dark",
      BackgroundImageFactory(context, "home-dark"),
    )
    ProcessorProvider.addProcessor(
      "background-image-nature-light",
      BackgroundImageFactory(context, "nature-light"),
    )
    ProcessorProvider.addProcessor(
      "background-image-nature-dark",
      BackgroundImageFactory(context, "nature-dark"),
    )
    ProcessorProvider.addProcessor(
      "background-image-stylized-light",
      BackgroundImageFactory(context, "stylized-light"),
    )
    ProcessorProvider.addProcessor(
      "background-image-stylized-dark",
      BackgroundImageFactory(context, "stylized-dark"),
    )
    ProcessorProvider.addProcessor(
      "background-image-simiancraft-light",
      BackgroundImageFactory(context, "simiancraft-light"),
    )
    ProcessorProvider.addProcessor(
      "background-image-simiancraft-dark",
      BackgroundImageFactory(context, "simiancraft-dark"),
    )
  }
}
