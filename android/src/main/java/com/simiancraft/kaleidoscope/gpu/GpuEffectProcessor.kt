// GPU-based VideoFrameProcessor. One instance per active effect; rn-webrtc
// invokes process() per frame on the SurfaceTextureHelper's GL thread, so
// every GL call is implicitly on the correct context.
//
// Commit 3 of PLAN.md: this version is a passthrough — sample the OES
// camera texture and emit it as a 2D-backed VideoFrame, no other math.
// Architecture proof for the OES -> shader -> TextureBufferImpl -> renderer
// round-trip. Effect-specific math (blur, composite, image background) lands
// in later commits by swapping the fragment shader and adding mask inputs.

package com.simiancraft.kaleidoscope.gpu

import android.graphics.Matrix
import android.opengl.GLES30
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import org.webrtc.SurfaceTextureHelper
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.YuvConverter

internal class GpuEffectProcessor : VideoFrameProcessor {
  private var program: GlProgram? = null
  private var yuvConverter: YuvConverter? = null

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    if (textureHelper == null) return null
    val inputBuffer = frame.buffer
    if (inputBuffer !is VideoFrame.TextureBuffer) {
      // Pipeline currently expects texture-backed input. I420 input would
      // require a YUV-to-texture upload pass that we don't ship in v0.1.
      return null
    }
    if (inputBuffer.type != VideoFrame.TextureBuffer.Type.OES) {
      // Camera frames come in as OES; non-OES input means something upstream
      // already transformed and we should not double-process.
      return null
    }

    val width = inputBuffer.width
    val height = inputBuffer.height

    val saved = Egl.save()
    try {
      val prog = program ?: GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.OES_PASSTHROUGH_FRAG)
        .also { program = it }

      // Fresh output texture + FBO per frame. Cached pooling lands in a later
      // commit; the alloc per frame is cheap enough for the proof.
      val fbo = Fbo(width, height)

      // Bind the input OES texture to unit 0 and render it through the
      // passthrough shader into our FBO. The output is a standard 2D texture.
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GL_TEXTURE_EXTERNAL_OES, inputBuffer.textureId)
      fbo.bind()
      prog.use()
      prog.setInt("uTex", 0)
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
      GLES30.glDisable(GLES30.GL_BLEND)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)

      // Hand the output texture to downstream as a TextureBuffer. The release
      // callback fires when refcount hits zero and runs on the GL thread; we
      // delete both the texture and the FBO there.
      val outputTextureId = fbo.texture
      val fboHandle = fbo.framebuffer

      val outputBuffer = TextureBufferImpl(
        width,
        height,
        VideoFrame.TextureBuffer.Type.RGB,
        outputTextureId,
        Matrix(),
        textureHelper.handler,
        // Lazy on first frame so construction happens on the GL thread.
        yuvConverter ?: YuvConverter().also { yuvConverter = it },
        Runnable {
          val texIds = intArrayOf(outputTextureId)
          val fboIds = intArrayOf(fboHandle)
          GLES30.glDeleteTextures(1, texIds, 0)
          GLES30.glDeleteFramebuffers(1, fboIds, 0)
        },
      )

      return VideoFrame(outputBuffer, frame.rotation, frame.timestampNs)
    } finally {
      Egl.restore(saved)
    }
  }

  companion object {
    private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
  }
}
