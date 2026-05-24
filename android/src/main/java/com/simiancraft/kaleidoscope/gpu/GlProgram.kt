// Shader compile + link + uniform helpers. One instance per (vert, frag) pair.
// Constructed on the GL thread; not reusable across EGL contexts.

package com.simiancraft.kaleidoscope.gpu

import android.opengl.GLES30
import android.util.Log

internal class GlProgram(vertexSource: String, fragmentSource: String) {
  val id: Int

  init {
    val vs = compileShader(GLES30.GL_VERTEX_SHADER, vertexSource)
    val fs = compileShader(GLES30.GL_FRAGMENT_SHADER, fragmentSource)
    id = GLES30.glCreateProgram()
    GLES30.glAttachShader(id, vs)
    GLES30.glAttachShader(id, fs)
    GLES30.glLinkProgram(id)
    GLES30.glDetachShader(id, vs)
    GLES30.glDetachShader(id, fs)
    GLES30.glDeleteShader(vs)
    GLES30.glDeleteShader(fs)

    val status = IntArray(1)
    GLES30.glGetProgramiv(id, GLES30.GL_LINK_STATUS, status, 0)
    if (status[0] != GLES30.GL_TRUE) {
      val log = GLES30.glGetProgramInfoLog(id)
      GLES30.glDeleteProgram(id)
      error("Kaleidoscope: shader link failed: $log")
    }
  }

  fun use() {
    GLES30.glUseProgram(id)
  }

  fun uniformLocation(name: String): Int = GLES30.glGetUniformLocation(id, name)

  fun setInt(name: String, value: Int) {
    GLES30.glUniform1i(uniformLocation(name), value)
  }

  fun setFloat(name: String, value: Float) {
    GLES30.glUniform1f(uniformLocation(name), value)
  }

  fun setVec2(name: String, x: Float, y: Float) {
    GLES30.glUniform2f(uniformLocation(name), x, y)
  }

  /** Upload a column-major 2x2 (4 floats) to a mat2 uniform. */
  fun setMat2(name: String, columnMajor: FloatArray) {
    GLES30.glUniformMatrix2fv(uniformLocation(name), 1, false, columnMajor, 0)
  }

  fun delete() {
    GLES30.glDeleteProgram(id)
  }

  companion object {
    private const val TAG = "Kaleidoscope.GlProgram"

    private fun compileShader(type: Int, source: String): Int {
      val handle = GLES30.glCreateShader(type)
      GLES30.glShaderSource(handle, source)
      GLES30.glCompileShader(handle)
      val status = IntArray(1)
      GLES30.glGetShaderiv(handle, GLES30.GL_COMPILE_STATUS, status, 0)
      if (status[0] != GLES30.GL_TRUE) {
        val log = GLES30.glGetShaderInfoLog(handle)
        GLES30.glDeleteShader(handle)
        // Surface the source so adb logcat shows which shader failed.
        Log.e(TAG, "shader source:\n$source")
        error("Kaleidoscope: shader compile failed: $log")
      }
      return handle
    }
  }
}
