// Android transform effects — GPU pipeline. One factory class serves all four
// geometric reorientation ops (flip-x, flip-y, rotate-cw, rotate-ccw); each
// registration passes a different Orientation.Op.
//
// flip-x  = screen-horizontal mirror (left<->right, head stays up); keeps w x h.
// flip-y  = screen-vertical flip (upside down, left/right unchanged); keeps w x h.
// rotate-cw  = whole frame rotated 90 degrees clockwise; output dims swap to h x w.
// rotate-ccw = 90 degrees counter-clockwise; output dims swap to h x w.
//
// flip-x replaces the old CPU "mirror" effect (the corrected screen-horizontal
// mirror); MirrorFactory and its "mirror" registration are removed.
//
// Per frame:
//   1. Render the input texture into a cached DISPLAY-UPRIGHT "original 2D" FBO,
//      exactly like the composite factory. The input is either:
//        - an OES camera texture (first in the chain): OES->2D passthrough with
//          Ingest folding the display rotation into the texture matrix, so the
//          FBO is sized in display dims and already upright; or
//        - an RGB GL_TEXTURE_2D texture (chained after an art effect or a
//          preceding transform): a plain 2D-sampler passthrough copy, since the
//          upstream pass already normalized orientation (display-upright,
//          rotation 0). No texture matrix on this path; folding rotation again
//          would double-apply it.
//   2. Single TRANSFORM_FRAG pass: sample that upright 2D copy through the
//      uUvTransform mat2 from Orientation.mat2For(op) into a fresh output
//      texture sized display w x h (flips) or h x w (rotations).
//   3. Wrap the fresh output texture in a TextureBufferImpl and return a
//      VideoFrame at rotation 0 (pixels are already upright).
//
// Camera orientation lives ONLY in Ingest; the op here is pure screen space and
// never consults frame.rotation. All failure paths log under
// Kaleidoscope.Transform and return null so upstream forwards the original frame.

package com.simiancraft.kaleidoscope.effects

import android.graphics.Matrix
import android.opengl.GLES30
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import com.simiancraft.kaleidoscope.EffectTuning
import com.simiancraft.kaleidoscope.gpu.Egl
import com.simiancraft.kaleidoscope.gpu.Fbo
import com.simiancraft.kaleidoscope.gpu.FramePipeline
import com.simiancraft.kaleidoscope.gpu.GlDebug
import com.simiancraft.kaleidoscope.gpu.GlProgram
import com.simiancraft.kaleidoscope.gpu.Ingest
import com.simiancraft.kaleidoscope.gpu.Orientation
import com.simiancraft.kaleidoscope.gpu.Shaders
import org.webrtc.SurfaceTextureHelper
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.YuvConverter

/**
 * @param op Which screen-space reorientation this factory's processor applies.
 */
class TransformFactory(
  private val op: Orientation.Op,
) : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = TransformProcessor(op)
}

private class TransformProcessor(
  private val op: Orientation.Op,
) : VideoFrameProcessor {
  // process() is only ever invoked on the single SurfaceTextureHelper capture
  // thread (VideoEffectProcessor.onFrameCaptured), so this never actually
  // contends. Retained as cheap uncontended insurance and as an explicit marker
  // that the GL state below is single-threaded; it is NOT a cross-thread guard.
  private val lock = Any()

  private var oesToTwoD: GlProgram? = null
  // 2D-sampler passthrough for the RGB-input branch (chained after an art
  // effect or a preceding transform, whose output is a GL_TEXTURE_2D buffer).
  private var twoDToTwoD: GlProgram? = null
  private var transformProgram: GlProgram? = null

  // Cached display-oriented "original 2D" copy at full input resolution.
  private var originalFbo: Fbo? = null
  private var cachedWidth = 0
  private var cachedHeight = 0

  private var yuvConverter: YuvConverter? = null

  // R3: one-frame GPU pipeline (see FramePipeline). Replaces the per-frame
  // glFinish; only changes WHEN the frame is returned, not its orientation.
  private val pipeline = FramePipeline()

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return synchronized(lock) { processOuter(frame, textureHelper) }
  }

  private fun processOuter(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return try {
      processInner(frame, textureHelper)
    } catch (t: Throwable) {
      Log.e(
        TAG,
        "process() threw; falling through to original frame. op=$op " +
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
      Log.w(TAG, "textureHelper is null; falling through.")
      return null
    }
    val inputBuffer = frame.buffer
    if (inputBuffer !is VideoFrame.TextureBuffer) {
      // Chained after a CPU effect emitting I420 — silently forward.
      return null
    }
    // Both texture types are valid inputs:
    //  - OES (GL_TEXTURE_EXTERNAL_OES): the raw camera frame, first in the
    //    chain. Sampled through OES_PASSTHROUGH_FRAG with the composed texture
    //    matrix so the FBO lands display-upright (Ingest normalization).
    //  - RGB (GL_TEXTURE_2D): the output of a preceding art effect
    //    (background/blur/shader) or a preceding transform. That upstream pass
    //    already normalized orientation (display-upright, rotation 0), so it is
    //    copied into the FBO via a plain 2D-sampler passthrough with NO texture
    //    matrix; re-applying Ingest here would double-apply the rotation.
    val isOes = inputBuffer.type == VideoFrame.TextureBuffer.Type.OES
    val bufW = inputBuffer.width
    val bufH = inputBuffer.height
    if (bufW <= 0 || bufH <= 0) {
      Log.w(TAG, "Degenerate dims ${bufW}x${bufH}; forwarding.")
      return null
    }

    // Ingest normalization: the OES->2D pass lands a DISPLAY-UPRIGHT frame, so
    // the original FBO is sized in DISPLAY dims and the op runs in pure screen
    // space (Orientation no longer consults frame.rotation). For an RGB input
    // the upstream effect already emitted display dims at rotation 0, so the
    // buffer dims ARE the display dims; do not fold rotation a second time.
    val width = if (isOes) Ingest.displayWidth(bufW, bufH, frame.rotation) else bufW
    val height = if (isOes) Ingest.displayHeight(bufW, bufH, frame.rotation) else bufH

    // Rotations swap the (display) output dimensions; flips keep them.
    val swap = Orientation.swapsDimensions(op)
    val outWidth = if (swap) height else width
    val outHeight = if (swap) width else height

    GlDebug.check("transform entry")
    val saved = Egl.save()
    var outputTextureId = 0
    var outputFboHandle = 0
    return try {
      ensurePrograms()
      ensureIntermediates(width, height)
      val origFbo = originalFbo ?: error("originalFbo null after ensure")
      val transform = transformProgram ?: error("transformProgram null after ensure")

      // ===== Pass 1: input texture -> display-oriented "original 2D" =====
      // Two input acquisitions land the same display-upright "original 2D" FBO;
      // only the sampler + matrix differ. Pass 2 below is identical for both.
      origFbo.bind()
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
      GLES30.glDisable(GLES30.GL_BLEND)
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      if (isOes) {
        val oes = oesToTwoD ?: error("oesToTwoD program null after ensure")
        GLES30.glBindTexture(GL_TEXTURE_EXTERNAL_OES, inputBuffer.textureId)
        oes.use()
        oes.setInt("uTex", 0)
        // Compose transformMatrix with the display rotation so the FBO lands upright.
        val texMatrix = Ingest.composedTexMatrix(inputBuffer.transformMatrix, frame.rotation)
        GLES30.glUniformMatrix4fv(oes.uniformLocation("uTexMatrix"), 1, false, texMatrix, 0)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        GlDebug.check("transform OES->2D")
      } else {
        // RGB / GL_TEXTURE_2D input: upstream already display-upright at
        // rotation 0. Plain passthrough copy; no texture matrix (mirrors
        // Mask's 2D downsample and the bg/blur 2D-source handling).
        val twoD = twoDToTwoD ?: error("twoDToTwoD program null after ensure")
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, inputBuffer.textureId)
        twoD.use()
        twoD.setInt("uTex", 0)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        GlDebug.check("transform 2D->2D")
      }

      // ===== Pass 2: geometric reorientation into a fresh output texture =====
      // Output FBO is sized for the (possibly swapped) output dims. The
      // uUvTransform mat2 reads the square [0,1] original UV back through the
      // op; rotations map the unit square onto itself, so swapping the FBO's
      // physical dims yields the rotated image with no UV clamping.
      val outputFbo = Fbo(outWidth, outHeight)
      outputTextureId = outputFbo.texture
      outputFboHandle = outputFbo.framebuffer

      outputFbo.bind()
      transform.use()
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, origFbo.texture)
      transform.setInt("uTex", 0)
      // Input is already display-upright (ingest), so the op is pure screen
      // space; frame.rotation is no longer consulted here.
      transform.setMat2("uUvTransform", Orientation.mat2For(op))
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("transform reorient pass")

      // Detach the texture from the FBO and free the FBO; the texture lives
      // with the VideoFrame and is deleted in the release callback.
      GLES30.glFramebufferTexture2D(
        GLES30.GL_FRAMEBUFFER,
        GLES30.GL_COLOR_ATTACHMENT0,
        GLES30.GL_TEXTURE_2D,
        0,
        0,
      )
      GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
      GLES30.glDeleteFramebuffers(1, intArrayOf(outputFboHandle), 0)
      outputFboHandle = 0
      GlDebug.check("transform output cleanup")

      // R3: fence this frame and hand the previous GPU-complete frame off. The
      // (possibly swapped) output dims travel with the frame, so the previous
      // frame's own dims/rotation are wrapped unchanged; orientation behavior
      // is untouched, only the return is deferred one frame.
      val ready = pipeline.enqueue(
        outputTextureId,
        outWidth,
        outHeight,
        // Pixels are already display-upright after ingest; emit rotation 0.
        0,
        frame.timestampNs,
        EffectTuning.debugTiming,
        TAG,
      )
      outputTextureId = 0
      ready ?: return null

      val yc = yuvConverter ?: run {
        val c = YuvConverter()
        yuvConverter = c
        c
      }

      val readyTextureId = ready.textureId
      val outputBuffer = TextureBufferImpl(
        ready.width,
        ready.height,
        VideoFrame.TextureBuffer.Type.RGB,
        readyTextureId,
        Matrix(),
        textureHelper.handler,
        yc,
        Runnable {
          GLES30.glDeleteTextures(1, intArrayOf(readyTextureId), 0)
        },
      )

      VideoFrame(outputBuffer, ready.rotation, ready.timestampNs)
    } catch (t: Throwable) {
      if (outputTextureId != 0) {
        try {
          GLES30.glDeleteTextures(1, intArrayOf(outputTextureId), 0)
        } catch (delErr: Throwable) {
          Log.w(TAG, "failed to free orphan texture $outputTextureId", delErr)
        }
      }
      if (outputFboHandle != 0) {
        try {
          GLES30.glDeleteFramebuffers(1, intArrayOf(outputFboHandle), 0)
        } catch (delErr: Throwable) {
          Log.w(TAG, "failed to free orphan FBO $outputFboHandle", delErr)
        }
      }
      throw t
    } finally {
      Egl.restore(saved)
    }
  }

  private fun ensurePrograms() {
    if (oesToTwoD == null) {
      oesToTwoD = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.OES_PASSTHROUGH_FRAG)
      GlDebug.check("oesToTwoD program compile/link")
    }
    if (twoDToTwoD == null) {
      twoDToTwoD = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.TWO_D_PASSTHROUGH_FRAG)
      GlDebug.check("twoDToTwoD program compile/link")
    }
    if (transformProgram == null) {
      transformProgram = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.TRANSFORM_FRAG)
      GlDebug.check("transform program compile/link")
    }
  }

  private fun ensureIntermediates(width: Int, height: Int) {
    if (cachedWidth == width && cachedHeight == height && originalFbo != null) return
    originalFbo?.delete()
    originalFbo = Fbo(width, height)
    cachedWidth = width
    cachedHeight = height
    GlDebug.check("transform intermediates allocated")
  }

  companion object {
    private const val TAG = "Kaleidoscope.Transform"
    private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
  }
}
