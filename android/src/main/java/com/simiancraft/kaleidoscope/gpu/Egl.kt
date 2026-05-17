// EGL / GLES state save and restore. rn-webrtc's EglRenderer (and downstream
// encoder paths) expect their GL state to survive our process() call;
// corrupting it surfaces as garbled output or hard-to-reproduce crashes one
// frame later. Snapshot before render, restore after, regardless of how the
// render returned.

package com.simiancraft.kaleidoscope.gpu

import android.opengl.GLES30

internal object Egl {
  private const val GL_TEXTURE_BINDING_EXTERNAL_OES = 0x8D67
  private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65

  /**
   * Convert an android.graphics.Matrix (3x3 row-major affine) into a flat 16-
   * element column-major float array suitable for glUniformMatrix4fv. Z row
   * and column become identity.
   *
   * android.graphics.Matrix values layout (from Matrix.getValues):
   *   [m00 m01 m02]   [a b c]
   *   [m10 m11 m12] = [d e f]
   *   [m20 m21 m22]   [g h i]
   *
   * Caller is responsible for the float array's lifetime (no per-call alloc
   * mitigation here; if it matters, reuse a buffer).
   */
  fun matrixToGl(matrix: android.graphics.Matrix): FloatArray {
    val v = FloatArray(9)
    matrix.getValues(v)
    return floatArrayOf(
      v[0], v[3], 0f, v[6],
      v[1], v[4], 0f, v[7],
      0f,   0f,   1f, 0f,
      v[2], v[5], 0f, v[8],
    )
  }

  data class State(
    val viewport: IntArray,
    val activeTexture: Int,
    val texture2DBinding: Int,
    val textureExternalBinding: Int,
    val program: Int,
    val arrayBuffer: Int,
    val vao: Int,
    val framebuffer: Int,
    val blendEnabled: Boolean,
    val depthTestEnabled: Boolean,
  )

  fun save(): State =
    State(
      viewport = IntArray(4).also { GLES30.glGetIntegerv(GLES30.GL_VIEWPORT, it, 0) },
      activeTexture = getInt(GLES30.GL_ACTIVE_TEXTURE),
      texture2DBinding = getInt(GLES30.GL_TEXTURE_BINDING_2D),
      textureExternalBinding = getInt(GL_TEXTURE_BINDING_EXTERNAL_OES),
      program = getInt(GLES30.GL_CURRENT_PROGRAM),
      arrayBuffer = getInt(GLES30.GL_ARRAY_BUFFER_BINDING),
      vao = getInt(GLES30.GL_VERTEX_ARRAY_BINDING),
      framebuffer = getInt(GLES30.GL_FRAMEBUFFER_BINDING),
      blendEnabled = GLES30.glIsEnabled(GLES30.GL_BLEND),
      depthTestEnabled = GLES30.glIsEnabled(GLES30.GL_DEPTH_TEST),
    )

  fun restore(s: State) {
    GLES30.glViewport(s.viewport[0], s.viewport[1], s.viewport[2], s.viewport[3])
    GLES30.glActiveTexture(s.activeTexture)
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, s.texture2DBinding)
    GLES30.glBindTexture(GL_TEXTURE_EXTERNAL_OES, s.textureExternalBinding)
    GLES30.glUseProgram(s.program)
    GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, s.arrayBuffer)
    GLES30.glBindVertexArray(s.vao)
    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, s.framebuffer)
    if (s.blendEnabled) GLES30.glEnable(GLES30.GL_BLEND) else GLES30.glDisable(GLES30.GL_BLEND)
    if (s.depthTestEnabled) {
      GLES30.glEnable(GLES30.GL_DEPTH_TEST)
    } else {
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
    }
  }

  private fun getInt(pname: Int): Int {
    val out = IntArray(1)
    GLES30.glGetIntegerv(pname, out, 0)
    return out[0]
  }
}
