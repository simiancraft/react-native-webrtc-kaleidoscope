// Layer-shader GLSL for the native composite compositor. Every program here is
// single-sourced from catalog/shaders/_shared/<name>.frag via build:shaders and
// read through ShadersGenerated; CompositeFactory links each with PASSTHROUGH_VERT.
// The generative backgrounds are likewise the generated GENERATIVE map.
//
// All are GLSL ES 3.00, matching the native GL context. image/subject/masked are
// the fixed compositor primitives (cover-fit image, masked camera person, masked
// scratch); each shaders/_shared/composite-*.frag documents its premultiply and
// mask-UV contract.

package com.simiancraft.kaleidoscope.effects

import com.simiancraft.kaleidoscope.gpu.ShadersGenerated

internal object LayerShaders {
    // Cover-fit a still image, premultiplied. shaders/_shared/composite-image.frag.
    val IMAGE_FRAG = ShadersGenerated.COMPOSITE_IMAGE_FRAG

    // Masked camera person, premultiplied. shaders/_shared/composite-subject.frag.
    val SUBJECT_FRAG = ShadersGenerated.COMPOSITE_SUBJECT_FRAG

    // Stencil any layer to the subject. shaders/_shared/composite-masked.frag.
    val MASKED_FRAG = ShadersGenerated.COMPOSITE_MASKED_FRAG

    // Every generative background is single-sourced from shaders/<name>.frag via
    // build:shaders, which emits the name -> source map. The compositor reads this
    // directly, so adding a generative to GENERATIVE_SHADERS registers it on
    // Android with no edit here.
    val GENERATIVE: Map<String, String> = ShadersGenerated.GENERATIVE
}
