// Android blur effect — GPU pipeline.
//
// Per frame:
//   1. Render the input OES camera texture through an OES->2D passthrough
//      shader into a cached intermediate FBO (the "original 2D" copy).
//   2. Produce a mask via Mask.produce (which downsamples the original 2D,
//      reads it back to a Bitmap, runs MLKit Selfie Segmentation, uploads
//      the confidence map as a 2D GL texture).
//   3. Run two separable Gaussian blur passes on the "original 2D" copy
//      using ping-pong FBOs.
//   4. Composite original + blurred + mask into a fresh output texture via
//      COMPOSITE_FRAG.
//   5. Wrap the fresh output texture in a TextureBufferImpl and return a
//      VideoFrame.
//
// Every observable failure logs to adb logcat under Kaleidoscope.Blur and
// returns null so upstream forwards the original frame instead of crashing.
//
// Replaces the CPU implementation (manual Kotlin YUV/ARGB conversion +
// MLKit + RenderScript). The CPU path was ~5-10 FPS at 720p; the GPU path
// now runs MLKit on a worker thread (see Mask.kt) with a last-known-mask
// cache, so the render thread is no longer gated on segmentation.

package com.simiancraft.kaleidoscope.effects

import android.content.Context
import android.graphics.Matrix
import android.opengl.GLES30
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import com.simiancraft.kaleidoscope.gpu.Egl
import com.simiancraft.kaleidoscope.gpu.Fbo
import com.simiancraft.kaleidoscope.gpu.GlDebug
import com.simiancraft.kaleidoscope.gpu.GlProgram
import com.simiancraft.kaleidoscope.gpu.Shaders
import com.simiancraft.kaleidoscope.segmentation.Mask
import com.simiancraft.kaleidoscope.segmentation.MaskTuning
import org.webrtc.SurfaceTextureHelper
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.YuvConverter

/**
 * @param context Currently unused; held for parity with BackgroundImageFactory
 *                and for future GPU resources that need a Context.
 * @param maskHardness 0.0 (soft halo) to 1.0 (hard edge). Default 0.5
 *                     reproduces the prior hardcoded smoothstep(0.35, 0.65).
 */
class BlurFactory(
  private val context: Context,
  private val maskHardness: Float = 0.5f,
) : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = BlurProcessor(maskHardness)
}

private class BlurProcessor(maskHardness: Float) : VideoFrameProcessor {
  private val maskLo: Float
  private val maskHi: Float

  init {
    val (lo, hi) = MaskTuning.smoothstepRange(maskHardness)
    maskLo = lo
    maskHi = hi
  }

  private val lock = Any()

  private var oesToTwoD: GlProgram? = null
  private var blurProgram: GlProgram? = null
  private var compositeProgram: GlProgram? = null

  // Cached intermediate textures + FBOs (full input resolution). Reused
  // across frames; recreated on resolution change.
  private var originalFbo: Fbo? = null
  private var blurAFbo: Fbo? = null
  private var blurBFbo: Fbo? = null
  private var cachedWidth = 0
  private var cachedHeight = 0

  private val mask = Mask()
  private var yuvConverter: YuvConverter? = null

  // Pre-computed 9-tap Gaussian kernel. Sigma + spacing pick the visual
  // weight of the blur; both are hardcoded for v0.1 and become BlurSpec
  // uniforms when the parameterized API plumbs through.
  //   sigma=8, tapSpacing=2 -> kernel covers ~+/-16 pixels, smooth falloff.
  private val blurWeights: FloatArray
  private val blurOffsets: FloatArray

  init {
    val taps = 9
    val sigma = 8.0
    val tapSpacing = 2.0
    val w = FloatArray(taps)
    val o = FloatArray(taps)
    for (i in 0 until taps) {
      o[i] = (i * tapSpacing).toFloat()
      val x = o[i].toDouble()
      w[i] = Math.exp(-(x * x) / (2.0 * sigma * sigma)).toFloat()
    }
    // Normalize: center contributes once, each side tap contributes twice
    // because the shader samples vUv +/- offset and adds each.
    var sum = w[0]
    for (i in 1 until taps) sum += 2f * w[i]
    for (i in 0 until taps) w[i] = w[i] / sum
    blurWeights = w
    blurOffsets = o
  }

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return synchronized(lock) { processOuter(frame, textureHelper) }
  }

  private fun processOuter(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return try {
      processInner(frame, textureHelper)
    } catch (t: Throwable) {
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
      Log.w(TAG, "textureHelper is null; falling through.")
      return null
    }
    val inputBuffer = frame.buffer
    if (inputBuffer !is VideoFrame.TextureBuffer) {
      // Chained after a CPU effect (mirror) emitting I420 — silently forward.
      return null
    }
    if (inputBuffer.type != VideoFrame.TextureBuffer.Type.OES) {
      Log.w(TAG, "TextureBuffer type is ${inputBuffer.type}; expected OES. Forwarding original.")
      return null
    }
    val width = inputBuffer.width
    val height = inputBuffer.height
    if (width <= 0 || height <= 0) {
      Log.w(TAG, "Degenerate dims ${width}x${height}; forwarding.")
      return null
    }

    GlDebug.check("blur entry")
    val saved = Egl.save()
    var outputTextureId = 0
    var outputFboHandle = 0
    return try {
      ensurePrograms()
      ensureIntermediates(width, height)
      val origFbo = originalFbo ?: error("originalFbo null after ensure")
      val blurA = blurAFbo ?: error("blurAFbo null after ensure")
      val blurB = blurBFbo ?: error("blurBFbo null after ensure")
      val oes = oesToTwoD ?: error("oesToTwoD program null after ensure")
      val blur = blurProgram ?: error("blurProgram null after ensure")
      val composite = compositeProgram ?: error("compositeProgram null after ensure")

      // ===== Pass 1: OES camera -> "original 2D" cached intermediate =====
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GL_TEXTURE_EXTERNAL_OES, inputBuffer.textureId)
      origFbo.bind()
      oes.use()
      oes.setInt("uTex", 0)
      val texMatrix = Egl.matrixToGl(inputBuffer.transformMatrix)
      GLES30.glUniformMatrix4fv(oes.uniformLocation("uTexMatrix"), 1, false, texMatrix, 0)
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
      GLES30.glDisable(GLES30.GL_BLEND)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("blur OES->2D")

      // ===== Mask production from the "original 2D" =====
      val maskTexId = mask.produce(origFbo.texture, width, height)
      if (maskTexId == -1) {
        Log.w(TAG, "Mask production failed; falling through.")
        return null
      }

      // ===== Pass 2: horizontal blur =====
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, origFbo.texture)
      blurA.bind()
      blur.use()
      blur.setInt("uTex", 0)
      GLES30.glUniform1fv(blur.uniformLocation("uWeights"), 9, blurWeights, 0)
      GLES30.glUniform1fv(blur.uniformLocation("uOffsets"), 9, blurOffsets, 0)
      GLES30.glUniform2f(blur.uniformLocation("uAxis"), 1.0f / width, 0.0f)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("blur horizontal pass")

      // ===== Pass 3: vertical blur =====
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, blurA.texture)
      blurB.bind()
      blur.use()
      blur.setInt("uTex", 0)
      GLES30.glUniform1fv(blur.uniformLocation("uWeights"), 9, blurWeights, 0)
      GLES30.glUniform1fv(blur.uniformLocation("uOffsets"), 9, blurOffsets, 0)
      GLES30.glUniform2f(blur.uniformLocation("uAxis"), 0.0f, 1.0f / height)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("blur vertical pass")

      // ===== Pass 4: composite (orig + blurred + mask -> fresh output) =====
      val outputFbo = Fbo(width, height)
      outputTextureId = outputFbo.texture
      outputFboHandle = outputFbo.framebuffer

      outputFbo.bind()
      composite.use()

      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, origFbo.texture)
      composite.setInt("uOriginal", 0)

      GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, blurB.texture)
      composite.setInt("uBackground", 1)

      GLES30.glActiveTexture(GLES30.GL_TEXTURE2)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTexId)
      composite.setInt("uMask", 2)

      // The blurred background is the same dimensions as the original; no
      // cover-fit needed. Identity UV transform.
      composite.setVec2("uBgUvScale", 1.0f, 1.0f)
      composite.setVec2("uBgUvOffset", 0.0f, 0.0f)

      GLES30.glUniform1f(composite.uniformLocation("uMaskLo"), maskLo)
      GLES30.glUniform1f(composite.uniformLocation("uMaskHi"), maskHi)

      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("blur composite pass")

      // Synchronize before handing the output texture to the renderer's
      // EGL context.
      GLES30.glFinish()

      // Detach the texture from the FBO and free the FBO. The texture lives
      // with the VideoFrame and gets deleted in the release callback.
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
      GlDebug.check("blur output cleanup")

      val yc = yuvConverter ?: run {
        val c = YuvConverter()
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
          GLES30.glDeleteTextures(1, intArrayOf(capturedTextureId), 0)
        },
      )
      outputTextureId = 0

      VideoFrame(outputBuffer, frame.rotation, frame.timestampNs)
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
    if (blurProgram == null) {
      blurProgram = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.BLUR_FRAG)
      GlDebug.check("blur program compile/link")
    }
    if (compositeProgram == null) {
      compositeProgram = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.COMPOSITE_FRAG)
      GlDebug.check("composite program compile/link")
    }
  }

  private fun ensureIntermediates(width: Int, height: Int) {
    if (cachedWidth == width && cachedHeight == height && originalFbo != null) return
    originalFbo?.delete()
    blurAFbo?.delete()
    blurBFbo?.delete()
    originalFbo = Fbo(width, height)
    blurAFbo = Fbo(width, height)
    blurBFbo = Fbo(width, height)
    cachedWidth = width
    cachedHeight = height
    GlDebug.check("blur intermediates allocated")
  }

  companion object {
    private const val TAG = "Kaleidoscope.Blur"
    private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
  }
}
