// GPU-based VideoFrameProcessor. One instance per active effect; rn-webrtc
// invokes process() per frame on the SurfaceTextureHelper's GL thread, so
// every GL call is implicitly on the correct context.
//
// Commit 3 of PLAN.md: this version is a passthrough — sample the OES
// camera texture and emit it as a 2D-backed VideoFrame, no other math.
// Architecture proof for the OES -> shader -> TextureBufferImpl -> renderer
// round-trip. Effect-specific math (blur, composite, image background) lands
// in later commits by swapping the fragment shader and adding mask inputs.
//
// Defensive-by-default: every observable failure path logs to adb logcat
// under the Kaleidoscope.* tags and returns null so upstream forwards the
// original frame instead of propagating a crash. The architecture proof
// itself can't fail loud on a device we can't attach a debugger to.

package com.simiancraft.kaleidoscope.gpu

import android.graphics.Matrix
import android.opengl.GLES30
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import org.webrtc.SurfaceTextureHelper
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.YuvConverter

internal class GpuEffectProcessor : VideoFrameProcessor {
  private var program: GlProgram? = null
  private var yuvConverter: YuvConverter? = null

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return try {
      processInner(frame, textureHelper)
    } catch (t: Throwable) {
      // Any failure here — shader compile, GL state corruption, unexpected
      // input type — must not crash the call. Return null so upstream
      // forwards the original frame.
      Log.e(
        TAG,
        "process() threw; falling through to original frame. " +
          "frame=${frame.buffer.width}x${frame.buffer.height} " +
          "rotation=${frame.rotation} bufferClass=${frame.buffer.javaClass.simpleName}",
        t,
      )
      null
    }
  }

  private fun processInner(
    frame: VideoFrame,
    textureHelper: SurfaceTextureHelper?,
  ): VideoFrame? {
    if (textureHelper == null) {
      Log.w(TAG, "textureHelper is null; cannot run GPU pipeline. Forwarding original.")
      return null
    }
    val inputBuffer = frame.buffer
    if (inputBuffer !is VideoFrame.TextureBuffer) {
      // Common and expected: when chained AFTER a CPU effect (mirror, blur)
      // that emits I420. Forward the original silently to avoid log spam.
      return null
    }
    if (inputBuffer.type != VideoFrame.TextureBuffer.Type.OES) {
      Log.w(
        TAG,
        "TextureBuffer type is ${inputBuffer.type} (not OES). Forwarding original.",
      )
      return null
    }

    val width = inputBuffer.width
    val height = inputBuffer.height
    if (width <= 0 || height <= 0) {
      Log.w(TAG, "Degenerate frame dims ${width}x${height}; forwarding original.")
      return null
    }

    // Drain any pre-existing GL errors so anything we surface below is ours.
    GlDebug.check("entry")

    val saved = Egl.save()
    var outputTextureId = 0
    var fboHandle = 0
    return try {
      val prog = program ?: run {
        val p = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.OES_PASSTHROUGH_FRAG)
        GlDebug.check("program compile/link")
        program = p
        p
      }

      // Fresh output texture + FBO per frame. Cached pooling lands in a later
      // commit; the alloc per frame is cheap enough for the architecture proof.
      val fbo = Fbo(width, height)
      outputTextureId = fbo.texture
      fboHandle = fbo.framebuffer
      GlDebug.check("fbo create")

      // Bind the input OES texture to unit 0 and render it through the
      // passthrough shader into our FBO. The output is a standard 2D texture.
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GL_TEXTURE_EXTERNAL_OES, inputBuffer.textureId)
      GlDebug.check("bind input OES texture")

      fbo.bind()
      prog.use()
      prog.setInt("uTex", 0)
      val texMatrix = Egl.matrixToGl(inputBuffer.transformMatrix)
      GLES30.glUniformMatrix4fv(prog.uniformLocation("uTexMatrix"), 1, false, texMatrix, 0)
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
      GLES30.glDisable(GLES30.GL_BLEND)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("drawArrays")

      // Block until the GPU has actually written the output texture. Without
      // this, the renderer's EGL context may sample the texture while our
      // context's draw is still pending, producing flickering / RGB-noise
      // frames. Heavy (~ms of stall) but correct; sync objects (glFenceSync)
      // would be cheaper as a future optimization.
      GLES30.glFinish()
      GlDebug.check("glFinish")

      // Detach the texture from the FBO before handing it off. Sampling a
      // texture that is still attached as a framebuffer color attachment is
      // undefined behavior per the GL spec.
      GLES30.glFramebufferTexture2D(
        GLES30.GL_FRAMEBUFFER,
        GLES30.GL_COLOR_ATTACHMENT0,
        GLES30.GL_TEXTURE_2D,
        0,
        0,
      )
      GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
      GLES30.glDeleteFramebuffers(1, intArrayOf(fboHandle), 0)
      // Mark the FBO handle as consumed so the failure path doesn't double-delete.
      fboHandle = 0
      GlDebug.check("detach + delete FBO")

      val yc = yuvConverter ?: run {
        val c = YuvConverter()
        GlDebug.check("YuvConverter ctor")
        yuvConverter = c
        c
      }

      val capturedTextureId = outputTextureId
      val outputBuffer = TextureBufferImpl(
        width,
        height,
        VideoFrame.TextureBuffer.Type.RGB,
        capturedTextureId,
        Matrix(),
        textureHelper.handler,
        yc,
        Runnable {
          // Texture deletion runs on the GL thread via the handler.
          GLES30.glDeleteTextures(1, intArrayOf(capturedTextureId), 0)
        },
      )
      // Ownership of the texture has transferred to the VideoFrame; clear our
      // local handle so the catch/finally won't free it under the renderer.
      outputTextureId = 0

      VideoFrame(outputBuffer, frame.rotation, frame.timestampNs)
    } catch (t: Throwable) {
      // Allocated handles that didn't make it into the VideoFrame are leaked
      // unless we free them here.
      if (outputTextureId != 0) {
        try {
          GLES30.glDeleteTextures(1, intArrayOf(outputTextureId), 0)
        } catch (delErr: Throwable) {
          Log.w(TAG, "failed to free orphan texture $outputTextureId", delErr)
        }
      }
      if (fboHandle != 0) {
        try {
          GLES30.glDeleteFramebuffers(1, intArrayOf(fboHandle), 0)
        } catch (delErr: Throwable) {
          Log.w(TAG, "failed to free orphan FBO $fboHandle", delErr)
        }
      }
      throw t
    } finally {
      Egl.restore(saved)
    }
  }

  companion object {
    private const val TAG = "Kaleidoscope.Gpu"
    private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
  }
}
