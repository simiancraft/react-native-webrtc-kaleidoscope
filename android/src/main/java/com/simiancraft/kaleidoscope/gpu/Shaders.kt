// GLSL source held as Kotlin string constants. v0.1 trades IDE syntax
// highlighting for the simplicity of zero asset-loading code; refactor to
// assets/shaders/*.frag if the count grows past ~6 or if external tooling
// (SPIRV-Cross, ShaderToy round-tripping) starts to matter.

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
}
