// Framebuffer + color-attached texture pair, sized for a render pass. Created
// once per resolution; later commits cache and reuse instances across frames
// to avoid per-frame GL allocation.

package com.simiancraft.kaleidoscope.gpu

import android.opengl.GLES30

internal class Fbo(val width: Int, val height: Int) {
  val texture: Int
  val framebuffer: Int

  init {
    val texIds = IntArray(1)
    GLES30.glGenTextures(1, texIds, 0)
    texture = texIds[0]
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture)
    GLES30.glTexImage2D(
      GLES30.GL_TEXTURE_2D,
      0,
      GLES30.GL_RGBA,
      width,
      height,
      0,
      GLES30.GL_RGBA,
      GLES30.GL_UNSIGNED_BYTE,
      null,
    )
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)

    val fboIds = IntArray(1)
    GLES30.glGenFramebuffers(1, fboIds, 0)
    framebuffer = fboIds[0]
    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, framebuffer)
    GLES30.glFramebufferTexture2D(
      GLES30.GL_FRAMEBUFFER,
      GLES30.GL_COLOR_ATTACHMENT0,
      GLES30.GL_TEXTURE_2D,
      texture,
      0,
    )
    val status = GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER)
    if (status != GLES30.GL_FRAMEBUFFER_COMPLETE) {
      error("Kaleidoscope: FBO incomplete: $status")
    }
    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
  }

  fun bind() {
    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, framebuffer)
    GLES30.glViewport(0, 0, width, height)
  }

  fun delete() {
    GLES30.glDeleteFramebuffers(1, intArrayOf(framebuffer), 0)
    GLES30.glDeleteTextures(1, intArrayOf(texture), 0)
  }
}
