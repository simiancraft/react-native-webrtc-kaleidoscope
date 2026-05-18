// GLSL source held as Kotlin string constants. v0.1 trades IDE syntax
// highlighting for the simplicity of zero asset-loading code; refactor to
// assets/shaders/*.frag if the count grows past ~6 or if external tooling
// (SPIRV-Cross, ShaderToy round-tripping) starts to matter.
//
// Shapes mirror the web GLSL in src/web/effects/*.ts. Keep in sync manually.

package com.simiancraft.kaleidoscope.gpu

internal object Shaders {
  // Procedural full-screen quad via gl_VertexID; no VAO or VBO required.
  // Caller does: glDrawArrays(GL_TRIANGLE_STRIP, 0, 4).
  // gl_VertexID -> (p in 0..2 space) -> (clip in -1..1, uv in 0..1)
  //   0 -> (0,0) -> (-1,-1), uv (0,0)
  //   1 -> (2,0) -> ( 1,-1), uv (1,0)
  //   2 -> (0,2) -> (-1, 1), uv (0,1)
  //   3 -> (2,2) -> ( 1, 1), uv (1,1)
  const val PASSTHROUGH_VERT = """#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 1), float(gl_VertexID & 2));
  vUv = p * 0.5;
  gl_Position = vec4(p - 1.0, 0.0, 1.0);
}
"""

  // Sample the OES external camera texture and emit as 2D RGBA. The first
  // pass of every effect runs this so subsequent passes can use sampler2D.
  //
  // The camera's TextureBuffer carries a transform matrix that encodes the
  // selfie mirror (front cameras), sensor orientation correction, and any
  // crop. The renderer applies it when displaying the raw OES; we have to
  // apply it ourselves before sampling, otherwise our 2D output is the raw
  // sensor view instead of the screen-aligned view.
  const val OES_PASSTHROUGH_FRAG = """#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision mediump float;
uniform samplerExternalOES uTex;
uniform mat4 uTexMatrix;
in vec2 vUv;
out vec4 oColor;
void main() {
  vec4 transformed = uTexMatrix * vec4(vUv, 0.0, 1.0);
  oColor = texture(uTex, transformed.xy);
}
"""

  // Separable 1D Gaussian using pre-computed weights + offsets uniform arrays.
  // 17 texture lookups per pixel (1 center + 8 symmetric pairs) and zero
  // exp() calls; the kernel is computed once on the CPU and uploaded once
  // per program use. Inspired by software-mansion/react-native-executorch's
  // GlBlurRenderer pattern; ~2x faster than evaluating the Gaussian
  // per-pixel in the fragment shader.
  //
  // uAxis is (1/width, 0) for the horizontal pass and (0, 1/height) for the
  // vertical pass. uOffsets[0] is the center tap (zero); offsets are in
  // pixel units, so the shader multiplies by uAxis to convert to UV space.
  const val BLUR_FRAG = """#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uAxis;
uniform float uWeights[9];
uniform float uOffsets[9];
in vec2 vUv;
out vec4 oColor;
void main() {
  vec4 color = texture(uTex, vUv) * uWeights[0];
  for (int i = 1; i < 9; i++) {
    vec2 off = uAxis * uOffsets[i];
    color += texture(uTex, vUv + off) * uWeights[i];
    color += texture(uTex, vUv - off) * uWeights[i];
  }
  oColor = color;
}
"""

  // Composite: mix(background, original, mask). One shader, byte-identical
  // to src/web/shaders.ts's COMPOSITE_FRAG_SRC.
  //
  // uOriginal and uBackground are expected to land with semantic "top of
  // source image" at GL v=1; the shader samples both at vUv directly. On
  // Android the OES->2D pass with transformMatrix lands the original at
  // v=1, and the bg PNG is pre-flipped via Bitmap matrix before
  // GLUtils.texImage2D since Android OpenGL ES has no flipY flag.
  //
  // uMask is sampled at vUv * uMaskUvScale + uMaskUvOffset. On Android,
  // those are identity (1,1) and (0,0) because the readback round-trip
  // (glReadPixels bottom-up plus Bitmap top-down plus GLUtils.texImage2D
  // row-preserving) leaves the mask aligned with origFbo. On web they are
  // (1,-1) and (0,1) to encode a V-flip on the mask sampling, because
  // canvas-staging the mask there would mangle the soft confidence values
  // in alpha (premultiplied-alpha math).
  //
  // uMaskLo / uMaskHi parameterize the smoothstep transition over the raw
  // confidence map. The processor computes them from a maskHardness factor
  // (0 = soft halo, 1 = hard edge) so callers do not have to think in lo/hi
  // pairs.
  //
  // uBgUvScale and uBgUvOffset control how the background texture is mapped
  // onto the output. For blur, they are (1,1) and (0,0); sample the full
  // blurred copy. For background-image, the caller computes them to perform
  // a cover-fit center crop so an arbitrarily-shaped image fills the output
  // without distortion.
  const val COMPOSITE_FRAG = """#version 300 es
precision mediump float;
uniform sampler2D uOriginal;
uniform sampler2D uBackground;
uniform sampler2D uMask;
uniform vec2 uBgUvScale;
uniform vec2 uBgUvOffset;
uniform vec2 uMaskUvScale;
uniform vec2 uMaskUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in vec2 vUv;
out vec4 oColor;
void main() {
  vec2 maskUv = vUv * uMaskUvScale + uMaskUvOffset;
  float raw = texture(uMask, maskUv).r;
  float m = smoothstep(uMaskLo, uMaskHi, raw);
  vec3 orig = texture(uOriginal, vUv).rgb;
  vec2 bgUv = vUv * uBgUvScale + uBgUvOffset;
  vec3 bg = texture(uBackground, bgUv).rgb;
  oColor = vec4(mix(bg, orig, m), 1.0);
}
"""
}
