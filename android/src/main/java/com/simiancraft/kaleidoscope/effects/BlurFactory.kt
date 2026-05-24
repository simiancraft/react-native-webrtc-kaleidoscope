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
import com.simiancraft.kaleidoscope.EffectTuning
import com.simiancraft.kaleidoscope.gpu.Egl
import com.simiancraft.kaleidoscope.gpu.Fbo
import com.simiancraft.kaleidoscope.gpu.FramePipeline
import com.simiancraft.kaleidoscope.gpu.GlDebug
import com.simiancraft.kaleidoscope.gpu.Ingest
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
 *
 * Runtime parameters (sigma, maskHardness) live on
 * com.simiancraft.kaleidoscope.EffectTuning and are read per frame; JS
 * tweaks them via the Expo Module's setBlurSigma / setMaskHardness
 * functions without rebuilding the processor.
 */
class BlurFactory(
  private val context: Context,
) : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = BlurProcessor()
}

private class BlurProcessor : VideoFrameProcessor {
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
  // R1: the blur ping-pong runs at a downscaled resolution; these hold its
  // dimensions so the blur passes set uAxis in the downscaled texel space.
  private var blurW = 0
  private var blurH = 0

  private val mask = Mask()
  private var yuvConverter: YuvConverter? = null

  // R3: one-frame GPU pipeline. process() hands each rendered texture here and
  // gets the previous frame's GPU-complete texture back, so the capture thread
  // never blocks on the current frame's GPU work (the old per-frame glFinish).
  private val pipeline = FramePipeline()

  // Linear-sampled separable Gaussian: 5 entries (center + 4 bilinear pairs).
  // sigma comes from EffectTuning at frame time; the kernel is rebuilt on the
  // CPU only when sigma changes. See src/web/blur-kernel.ts for the derivation.
  private val blurWeights = FloatArray(KERNEL_TAPS)
  private val blurOffsets = FloatArray(KERNEL_TAPS)
  private var cachedKernelSigma: Float = Float.NaN

  private fun ensureKernel(sigma: Float) {
    if (sigma == cachedKernelSigma) return
    val s = sigma.toDouble()
    fun g(t: Double) = Math.exp(-(t * t) / (2.0 * s * s))
    // Linear-sampled: center + 4 bilinear pairs of dense texels (1,2)(3,4)
    // (5,6)(7,8); each pair is one fractional-offset fetch. Normalize so
    // center + 2*sum(pairs) == 1 (the shader samples vUv +/- offset, adds each).
    blurOffsets[0] = 0f
    blurWeights[0] = g(0.0).toFloat()
    var sum = blurWeights[0]
    for (p in 1 until KERNEL_TAPS) {
      val a = (2 * p - 1).toDouble()
      val b = (2 * p).toDouble()
      val wa = g(a)
      val wb = g(b)
      val w = wa + wb
      blurOffsets[p] = ((a * wa + b * wb) / w).toFloat()
      blurWeights[p] = w.toFloat()
      sum += 2f * blurWeights[p]
    }
    for (i in 0 until KERNEL_TAPS) blurWeights[i] = blurWeights[i] / sum
    cachedKernelSigma = sigma
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
    val bufW = inputBuffer.width
    val bufH = inputBuffer.height
    if (bufW <= 0 || bufH <= 0) {
      Log.w(TAG, "Degenerate dims ${bufW}x${bufH}; forwarding.")
      return null
    }

    // Ingest normalization: the OES->2D pass below lands a DISPLAY-UPRIGHT frame
    // (Ingest folds frame.rotation into the texture matrix), so every cached FBO
    // and the output are sized in DISPLAY dims, and the frame goes out rotation 0.
    val width = Ingest.displayWidth(bufW, bufH, frame.rotation)
    val height = Ingest.displayHeight(bufW, bufH, frame.rotation)

    GlDebug.check("blur entry")
    val saved = Egl.save()
    var outputTextureId = 0
    var outputFboHandle = 0
    return try {
      ensurePrograms()
      ensureIntermediates(width, height)
      ensureKernel(EffectTuning.blurSigma)
      val (maskLo, maskHi) =
        MaskTuning.smoothstepRange(EffectTuning.maskHardness, EffectTuning.maskThreshold)
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
      // Compose transformMatrix with the display rotation so the FBO lands upright.
      val texMatrix = Ingest.composedTexMatrix(inputBuffer.transformMatrix, frame.rotation)
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

      // ===== Pass 1b: downsample original -> blurA (box-average) =====
      // uAxis=0 collapses the kernel to its center tap (weights sum to 1), so
      // this is a plain bilinear box-average into the downscaled target. Both
      // blur passes then run in downscaled space; sampling the full-res
      // original with downscaled-spaced offsets serrates the blur (see web fix).
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, origFbo.texture)
      blurA.bind()
      blur.use()
      blur.setInt("uTex", 0)
      GLES30.glUniform1fv(blur.uniformLocation("uWeights"), KERNEL_TAPS, blurWeights, 0)
      GLES30.glUniform1fv(blur.uniformLocation("uOffsets"), KERNEL_TAPS, blurOffsets, 0)
      GLES30.glUniform2f(blur.uniformLocation("uAxis"), 0.0f, 0.0f)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("blur downsample pass")

      // ===== Pass 2: horizontal blur blurA -> blurB (downscaled) =====
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, blurA.texture)
      blurB.bind()
      blur.use()
      blur.setInt("uTex", 0)
      GLES30.glUniform2f(blur.uniformLocation("uAxis"), 1.0f / blurW, 0.0f)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("blur horizontal pass")

      // ===== Pass 3: vertical blur blurB -> blurA (downscaled) =====
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, blurB.texture)
      blurA.bind()
      blur.use()
      blur.setInt("uTex", 0)
      GLES30.glUniform2f(blur.uniformLocation("uAxis"), 0.0f, 1.0f / blurH)
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
      // Final blurred result is in blurA after the vertical pass.
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, blurA.texture)
      composite.setInt("uBackground", 1)

      GLES30.glActiveTexture(GLES30.GL_TEXTURE2)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTexId)
      composite.setInt("uMask", 2)

      // The blurred background is the same dimensions as the original; no
      // cover-fit needed. Identity UV transform.
      composite.setVec2("uBgUvScale", 1.0f, 1.0f)
      composite.setVec2("uBgUvOffset", 0.0f, 0.0f)
      // Mask round-trip (glReadPixels + Bitmap + texImage2D) leaves mask
      // aligned with origFbo; identity UV transform — no flip needed.
      composite.setVec2("uMaskUvScale", 1.0f, 1.0f)
      composite.setVec2("uMaskUvOffset", 0.0f, 0.0f)

      GLES30.glUniform1f(composite.uniformLocation("uMaskLo"), maskLo)
      GLES30.glUniform1f(composite.uniformLocation("uMaskHi"), maskHi)

      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("blur composite pass")

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

      // R3: fence this frame's GPU work and hand the PREVIOUS (GPU-complete)
      // frame's texture downstream instead of glFinish-ing on this one. The
      // pipeline now owns outputTextureId, so zero our local handle to keep the
      // orphan-cleanup catch from double-freeing it.
      val ready = pipeline.enqueue(
        outputTextureId,
        width,
        height,
        // Pixels are already display-upright after ingest; emit rotation 0.
        0,
        frame.timestampNs,
        EffectTuning.debugTiming,
        TAG,
      )
      outputTextureId = 0
      // First frame: nothing to hand off yet. Forward the original frame once.
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
    // R1: blur at quarter area (half each axis), floored so the short side
    // stays >= 256px. The original stays full-res (foreground source + blur
    // input); the composite upscales the downscaled blurred bg with GL_LINEAR
    // for free, and the blur discards the detail the extra resolution carries.
    val shortSide = minOf(width, height)
    val target = maxOf(256, Math.round(shortSide * 0.5f))
    val scale = target.toFloat() / shortSide
    blurW = Math.round(width * scale).coerceAtLeast(2).let { if (it % 2 == 0) it else it - 1 }
    blurH = Math.round(height * scale).coerceAtLeast(2).let { if (it % 2 == 0) it else it - 1 }
    originalFbo = Fbo(width, height)
    blurAFbo = Fbo(blurW, blurH)
    blurBFbo = Fbo(blurW, blurH)
    cachedWidth = width
    cachedHeight = height
    GlDebug.check("blur intermediates allocated")
  }

  companion object {
    private const val TAG = "Kaleidoscope.Blur"
    private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
    private const val KERNEL_TAPS = 5
  }
}
