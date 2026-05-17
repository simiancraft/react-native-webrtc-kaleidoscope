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
  const val OES_PASSTHROUGH_FRAG = """#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision mediump float;
uniform samplerExternalOES uTex;
in vec2 vUv;
out vec4 oColor;
void main() {
  oColor = texture(uTex, vUv);
}
"""

  // Separable 1D Gaussian. uAxis is (1/width, 0) for the horizontal pass,
  // (0, 1/height) for the vertical pass. RADIUS is capped at 20 taps per
  // side; uSigma controls the effective falloff (taps beyond ~3*sigma
  // contribute ~0).
  const val BLUR_FRAG = """#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uAxis;
uniform float uSigma;
in vec2 vUv;
out vec4 oColor;
const int RADIUS = 20;
void main() {
  float sigma2 = uSigma * uSigma;
  vec4 sum = vec4(0.0);
  float wSum = 0.0;
  for (int i = -RADIUS; i <= RADIUS; i++) {
    float fi = float(i);
    float w = exp(-0.5 * fi * fi / sigma2);
    sum += texture(uTex, vUv + fi * uAxis) * w;
    wSum += w;
  }
  oColor = sum / wSum;
}
"""

  // Composite: mix(background, original, mask). The background is whatever
  // texture you bind to uBackground (a blurred copy, an image, a procedural
  // shader's output). Mask comes in as a single-channel image (we read .r).
  //
  // Mask sampling is V-flipped because MLKit returns the mask with the
  // opposite Y orientation from the rendered original. Same workaround as
  // the web side; keep consistent if changing either.
  //
  // smoothstep tightens the soft confidence map. Hardcoded for now; surfaces
  // as a maskHardness uniform when the spec API plumbs parameters end-to-end.
  const val COMPOSITE_FRAG = """#version 300 es
precision mediump float;
uniform sampler2D uOriginal;
uniform sampler2D uBackground;
uniform sampler2D uMask;
in vec2 vUv;
out vec4 oColor;
void main() {
  vec2 flipped = vec2(vUv.x, 1.0 - vUv.y);
  float raw = texture(uMask, flipped).r;
  float m = smoothstep(0.35, 0.65, raw);
  vec3 orig = texture(uOriginal, vUv).rgb;
  vec3 bg = texture(uBackground, vUv).rgb;
  oColor = vec4(mix(bg, orig, m), 1.0);
}
"""
}
