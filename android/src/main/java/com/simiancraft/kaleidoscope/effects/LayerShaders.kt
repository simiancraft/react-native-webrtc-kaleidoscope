// Layer-shader GLSL for the native composite compositor, embedded as Kotlin string
// constants. These mirror the canonical `shaders/<name>.frag` and their verbatim
// web copies in `web-driver/effects/layer-shaders.ts`. The generic shader codegen
// (`build:shaders`) only emits the GENERATIVE background channel today; layer
// shaders (the additive/overlay/background stack the compositor composites) are a
// distinct path, so they live here until the codegen grows a layer path. Keep
// each in sync with its `shaders/<name>.frag`.
//
// All are GLSL ES 3.00 (`#version 300 es`), matching the native GL context
// (see GlProgram / ShadersGenerated). Each generative layer takes `uTime`
// (seconds) and `uResolution` (vec2 px) plus its u-prefixed uniforms; output is
// premultiplied where the layer is meant to blend "over" (image, subject) or to
// emit straight RGB with alpha 1 where it is an opaque base (clouds, plasma,
// nebula, simianlights). Overlay layers (godrays, fireflies, anamorphic) emit
// premultiplied RGBA and are composited additively.

package com.simiancraft.kaleidoscope.effects

import com.simiancraft.kaleidoscope.gpu.ShadersGenerated

internal object LayerShaders {
    // ---- compositor-local layer programs (image + subject), ported from composite.ts -

    // Cover-fit a still texture, output PREMULTIPLIED so a straight-alpha image
    // (a transparent sky / cut-out opening) composites correctly with the "over"
    // blend: transparent regions show the stack beneath. uCoverScale zooms the UV
    // about center to crop-fit (mirrors BLIT_FRAG_SRC in composite.ts). No V-flip in
    // the shader: the image bitmap is pre-flipped on upload (matches
    // BackgroundImageFactory), so the texture already lands semantic-top at v=1.
    const val IMAGE_FRAG = """#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uCoverScale;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec2 uv = (vUv - 0.5) * uCoverScale + 0.5;
  vec4 c = texture(uTex, uv);
  oColor = vec4(c.rgb * c.a, c.a);
}
"""

    // The masked camera person, output PREMULTIPLIED (rgb already scaled by the
    // mask alpha) so a "normal" over-blend composites the person onto the stack.
    // Mirrors SUBJECT_FRAG_SRC in composite.ts. uMaskUvScale/uMaskUvOffset carry the
    // mask orientation: on Android the mask round-trip (glReadPixels bottom-up +
    // Bitmap top-down + packMask flip-back) leaves the mask aligned with the
    // camera FBO, so these are identity (1,1)/(0,0) here, unlike web's (1,-1)/(0,1).
    const val SUBJECT_FRAG = """#version 300 es
precision highp float;
uniform sampler2D uCamera;
uniform sampler2D uMask;
uniform vec2 uMaskUvScale;
uniform vec2 uMaskUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec3 cam = texture(uCamera, vUv).rgb;
  float raw = texture(uMask, vUv * uMaskUvScale + uMaskUvOffset).r;
  float safeHi = max(uMaskHi, uMaskLo + 0.001);
  float a = clamp(smoothstep(uMaskLo, safeHi, raw), 0.0, 1.0);
  oColor = vec4(cam * a, a);
}
"""

    // CAMERA layer migrated to the single-source pipeline; see
    // Shaders.COMPOSITE_CAMERA_FRAG (canonical shaders/_shared/composite-camera.frag).

    // BLUR layer migrated to the single-source pipeline; see
    // Shaders.COMPOSITE_BLUR_FRAG (canonical shaders/blur/composite-blur.frag).
    //
    // The compositor primitives that remain hand-written here (IMAGE, SUBJECT,
    // MASKED) are intentionally left hand-authored and mirrored in composite.ts
    // (web) and composite-*.metalsrc (iOS): small, stable, with bespoke host buffer
    // bindings, so they stay hand-maintained rather than codegen'd. Keep in sync.

    // Masked-composite: stencil a rendered scratch layer (uTex, treated as
    // premultiplied) to the subject by multiplying through the mask alpha. Keeps the
    // result premultiplied so the caller's "over"/"additive" blend composites it
    // correctly. Mirrors MASKED_FRAG_SRC in composite.ts; identity mask UV on Android
    // (the readback already aligns it), unlike web's (1,-1)/(0,1).
    const val MASKED_FRAG = """#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform vec2 uMaskUvScale;
uniform vec2 uMaskUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec4 c = texture(uTex, vUv);
  float raw = texture(uMask, vUv * uMaskUvScale + uMaskUvOffset).r;
  float safeHi = max(uMaskHi, uMaskLo + 0.001);
  float a = clamp(smoothstep(uMaskLo, safeHi, raw), 0.0, 1.0);
  oColor = c * a;
}
"""

    // Every generative background is single-sourced from shaders/<name>.frag via
    // build:shaders; this map points each dispatch name at its generated const.
    val GENERATIVE: Map<String, String> =
        mapOf(
            "godrays" to ShadersGenerated.GODRAYS_FRAG,
            "clouds" to ShadersGenerated.CLOUDS_FRAG,
            "fireflies" to ShadersGenerated.FIREFLIES_FRAG,
            "nebula" to ShadersGenerated.NEBULA_FRAG,
            "simianlights" to ShadersGenerated.SIMIANLIGHTS_FRAG,
            "anamorphic-lensflare" to ShadersGenerated.ANAMORPHIC_LENSFLARE_FRAG,
            "plasma" to ShadersGenerated.PLASMA_FRAG,
        )
}
