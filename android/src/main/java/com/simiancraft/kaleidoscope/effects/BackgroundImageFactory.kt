// Android background-image effect — GPU pipeline.
//
// Per frame:
//   1. Render the input OES camera texture into a cached "original 2D" FBO.
//   2. Lazy-load the named PNG asset (e.g. "office-1") from the library's
//      android/src/main/assets/backgrounds/ on first frame; upload as a 2D
//      GL texture; cache for subsequent frames.
//   3. Produce a mask via Mask.produce (downsample, MLKit, upload).
//   4. Composite original + image + mask into a fresh output texture via
//      COMPOSITE_FRAG.
//   5. Wrap the fresh output texture in a TextureBufferImpl and return a
//      VideoFrame.
//
// Each registered name (e.g. "background-image-office-1") gets its own
// factory keyed by an asset name; multiple factories can coexist if the
// consumer registers multiple variants.
//
// All failure paths log under Kaleidoscope.BgImage and fall through.

package com.simiancraft.kaleidoscope.effects

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.opengl.GLES30
import android.opengl.GLUtils
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import com.simiancraft.kaleidoscope.EffectTuning
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
 * @param context Used to read the PNG asset.
 * @param assetName Filename (without `.png`) under `assets/backgrounds/`.
 *                   E.g. "office-1" -> assets/backgrounds/office-1.png.
 *
 * maskHardness is read per frame from com.simiancraft.kaleidoscope.EffectTuning
 * so JS callers can tune the smoothstep edge via the Expo Module's
 * setMaskHardness function without rebuilding the processor.
 */
class BackgroundImageFactory(
  private val context: Context,
  private val assetName: String,
) : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor =
    BackgroundImageProcessor(context, assetName)
}

private class BackgroundImageProcessor(
  private val context: Context,
  private val assetName: String,
) : VideoFrameProcessor {
  private val lock = Any()

  private var oesToTwoD: GlProgram? = null
  private var compositeProgram: GlProgram? = null

  private var originalFbo: Fbo? = null
  private var cachedWidth = 0
  private var cachedHeight = 0

  private val mask = Mask()
  private var yuvConverter: YuvConverter? = null

  // Background image cached as a 2D GL texture; loaded lazily on the first
  // successful frame to ensure GL setup is ready. Aspect ratio captured at
  // load time so the composite shader can center-crop into the output.
  private var backgroundTextureId = 0
  private var backgroundAspect: Float = 1f

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return synchronized(lock) { processOuter(frame, textureHelper) }
  }

  private fun processOuter(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return try {
      processInner(frame, textureHelper)
    } catch (t: Throwable) {
      Log.e(
        TAG,
        "process() threw; falling through. assetName=$assetName " +
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
    if (inputBuffer !is VideoFrame.TextureBuffer) return null
    if (inputBuffer.type != VideoFrame.TextureBuffer.Type.OES) {
      Log.w(
        TAG,
        "TextureBuffer type is ${inputBuffer.type}; expected OES. Forwarding.",
      )
      return null
    }
    val width = inputBuffer.width
    val height = inputBuffer.height
    if (width <= 0 || height <= 0) {
      Log.w(TAG, "Degenerate dims ${width}x${height}; forwarding.")
      return null
    }

    GlDebug.check("bgImage entry")
    val saved = Egl.save()
    var outputTextureId = 0
    var outputFboHandle = 0
    return try {
      ensurePrograms()
      ensureIntermediates(width, height)
      ensureBackgroundTexture()
      if (backgroundTextureId == 0) {
        Log.w(TAG, "background texture unavailable (asset '$assetName' load failed); falling through.")
        return null
      }
      val origFbo = originalFbo ?: error("originalFbo null after ensure")
      val oes = oesToTwoD ?: error("oesToTwoD null after ensure")
      val composite = compositeProgram ?: error("compositeProgram null after ensure")

      // OES camera -> 2D original
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
      GlDebug.check("bgImage OES->2D")

      // Mask from the 2D original
      val maskTexId = mask.produce(origFbo.texture, width, height)
      if (maskTexId == -1) {
        Log.w(TAG, "Mask production failed; falling through.")
        return null
      }

      // Composite into a fresh output texture
      val outputFbo = Fbo(width, height)
      outputTextureId = outputFbo.texture
      outputFboHandle = outputFbo.framebuffer

      outputFbo.bind()
      composite.use()

      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, origFbo.texture)
      composite.setInt("uOriginal", 0)

      GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, backgroundTextureId)
      composite.setInt("uBackground", 1)

      GLES30.glActiveTexture(GLES30.GL_TEXTURE2)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTexId)
      composite.setInt("uMask", 2)

      // Center-crop cover fit so the bg image fills the output without
      // distortion. If bg is wider than output, crop horizontally; if
      // taller, crop vertically.
      val outAspect = width.toFloat() / height.toFloat()
      val bgAspect = backgroundAspect
      if (bgAspect > outAspect) {
        // bg is wider -> shrink u-range, full v-range
        val scaleX = outAspect / bgAspect
        composite.setVec2("uBgUvScale", scaleX, 1.0f)
        composite.setVec2("uBgUvOffset", (1f - scaleX) * 0.5f, 0.0f)
      } else {
        // bg is taller -> full u-range, shrink v-range
        val scaleY = bgAspect / outAspect
        composite.setVec2("uBgUvScale", 1.0f, scaleY)
        composite.setVec2("uBgUvOffset", 0.0f, (1f - scaleY) * 0.5f)
      }

      val (maskLo, maskHi) = MaskTuning.smoothstepRange(EffectTuning.maskHardness)
      GLES30.glUniform1f(composite.uniformLocation("uMaskLo"), maskLo)
      GLES30.glUniform1f(composite.uniformLocation("uMaskHi"), maskHi)

      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("bgImage composite pass")

      GLES30.glFinish()

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
      GlDebug.check("bgImage output cleanup")

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
      GlDebug.check("oesToTwoD compile/link")
    }
    if (compositeProgram == null) {
      compositeProgram = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.COMPOSITE_FRAG)
      GlDebug.check("composite compile/link")
    }
  }

  private fun ensureIntermediates(width: Int, height: Int) {
    if (cachedWidth == width && cachedHeight == height && originalFbo != null) return
    originalFbo?.delete()
    originalFbo = Fbo(width, height)
    cachedWidth = width
    cachedHeight = height
    GlDebug.check("bgImage intermediates allocated")
  }

  private fun ensureBackgroundTexture() {
    if (backgroundTextureId != 0) return
    val bmp = try {
      context.assets.open("backgrounds/$assetName.png").use { stream ->
        BitmapFactory.decodeStream(stream)
      }
    } catch (t: Throwable) {
      Log.e(TAG, "failed to load asset backgrounds/$assetName.png", t)
      return
    }
    if (bmp == null) {
      Log.e(TAG, "BitmapFactory returned null for backgrounds/$assetName.png")
      return
    }
    // Pre-flip vertically so the texture lands in the shared convention
    // (semantic top of source image at GL v=1). Android OpenGL ES has no
    // UNPACK_FLIP_Y equivalent, so we do the flip on the bitmap before
    // GLUtils.texImage2D copies it into the texture. One-time cost at
    // load; per-frame sampling stays at vUv with no shader-side V-flip.
    val flipMatrix = Matrix().apply { preScale(1f, -1f) }
    val flippedBmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, flipMatrix, false)
    try {
      val ids = IntArray(1)
      GLES30.glGenTextures(1, ids, 0)
      backgroundTextureId = ids[0]
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, backgroundTextureId)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
      GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, flippedBmp, 0)
      GlDebug.check("bgImage background upload")
      backgroundAspect = bmp.width.toFloat() / bmp.height.toFloat()
      Log.i(
        TAG,
        "background asset '$assetName' loaded; size=${bmp.width}x${bmp.height} aspect=$backgroundAspect",
      )
    } finally {
      flippedBmp.recycle()
      bmp.recycle()
    }
  }

  companion object {
    private const val TAG = "Kaleidoscope.BgImage"
    private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
  }
}
