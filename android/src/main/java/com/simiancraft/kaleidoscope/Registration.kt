// Frame-processor registration for Android. Called from
// KaleidoscopeModule.OnCreate at Expo Module init time, before any track
// requests an effect by name. The Context is needed by the compositor so it can
// read bundled assets: the composite image WebP files and the
// selfie_segmenter.tflite model (loaded via SegmentationEngine).
//
// The art axis is one registered "composite" compositor: blur, background
// images, and generative shaders are all layers inside a composite, delivered
// from JS via setCompositeLayers (see CompositeLayers / KaleidoscopeModule). There
// is no longer a per-effect factory per preset; the layer stack is data, swapped
// from JS as the active composite changes, so adding a preset needs no Kotlin
// change. Only the four geometric transforms stay statically named alongside it.

package com.simiancraft.kaleidoscope

import android.content.Context
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.simiancraft.kaleidoscope.effects.CompositeFactory
import com.simiancraft.kaleidoscope.effects.TransformFactory
import com.simiancraft.kaleidoscope.gpu.Orientation

object Registration {
  @JvmStatic
  fun registerAll(context: Context) {
    // Geometric reorientation effects. flip-x is the corrected screen-horizontal
    // mirror (replaces the old "mirror" CPU effect). The rotation correction
    // lives entirely in Orientation.kt; each registration just names its op.
    ProcessorProvider.addProcessor("flip-x", TransformFactory(Orientation.Op.FLIP_X))
    ProcessorProvider.addProcessor("flip-y", TransformFactory(Orientation.Op.FLIP_Y))
    ProcessorProvider.addProcessor("rotate-cw", TransformFactory(Orientation.Op.ROTATE_CW))
    ProcessorProvider.addProcessor("rotate-ccw", TransformFactory(Orientation.Op.ROTATE_CCW))

    // The single art compositor; every art effect (image, blur, generative) is a
    // layer in the stack JS delivers via setCompositeLayers.
    ProcessorProvider.addProcessor("composite", CompositeFactory(context))
  }
}
