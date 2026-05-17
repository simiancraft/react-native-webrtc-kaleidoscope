// Mask production: render a downsampled snapshot of the camera, hand it to
// MLKit Selfie Segmentation, upload the returned confidence map as a 2D GL
// texture the composite shader samples.
//
// v0.1 runs segmentation synchronously per frame on the GL thread (blocking
// Tasks.await). MLKit at downsampled resolution is the dominant per-frame
// cost (~20-40 ms on a midrange device); a worker-thread variant with a
// last-known-mask cache is queued for PLAN.md Commit 5 and will cut effective
// latency by one frame.
//
// All failure paths log to adb logcat under Kaleidoscope.Mask and return -1
// for the mask texture; callers must treat -1 as "no mask this frame" and
// either skip the composite or use a fallback white mask.

package com.simiancraft.kaleidoscope.gpu

import android.graphics.Bitmap
import android.opengl.GLES30
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal class Mask {
  private var segmenter: Segmenter? = null

  // Cached small-FBO state for the downsample pass.
  private var downsampleFbo: Fbo? = null
  private var downsampleProgram: GlProgram? = null

  // Cached output texture for the mask. Reused across frames.
  private var maskTextureId: Int = 0
  private var maskTexWidth: Int = 0
  private var maskTexHeight: Int = 0

  // Pre-allocated buffers to reduce per-frame GC churn.
  private var pixelByteBuffer: ByteBuffer? = null
  private var inputBitmap: Bitmap? = null
  private var maskOutBitmap: Bitmap? = null

  /**
   * Produce a mask GL texture from `source2D` (a sampler2D-compatible RGBA
   * texture, i.e. the camera frame after OES->2D conversion). The mask is at
   * `targetW x targetH` (whatever MLKit decides) and uses RGBA where R=G=B=
   * confidence and A=255.
   *
   * Returns the mask GL texture ID, or -1 if any step failed. Callers must
   * fall through to a default behavior (no composite or solid white mask).
   */
  fun produce(
    source2D: Int,
    sourceWidth: Int,
    sourceHeight: Int,
    downsampleSize: Int = 256,
  ): Int {
    try {
      // 1. Render source into the small downsample FBO.
      val dsW = downsampleSize
      // Preserve aspect to keep MLKit happier. Round to even pixels for safety.
      val dsH = (downsampleSize.toLong() * sourceHeight / sourceWidth).toInt().coerceAtLeast(16).let {
        if (it % 2 == 0) it else it - 1
      }

      val fbo = ensureDownsampleFbo(dsW, dsH)
      val prog = ensureDownsampleProgram()

      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, source2D)
      fbo.bind()
      prog.use()
      prog.setInt("uTex", 0)
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
      GLES30.glDisable(GLES30.GL_BLEND)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("mask downsample render")

      // 2. Read back the downsample into a Bitmap.
      val byteCount = dsW * dsH * 4
      val pixelBuf = ensurePixelByteBuffer(byteCount)
      GLES30.glReadPixels(0, 0, dsW, dsH, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, pixelBuf)
      GlDebug.check("mask glReadPixels")

      val inputBmp = ensureInputBitmap(dsW, dsH)
      pixelBuf.rewind()
      inputBmp.copyPixelsFromBuffer(pixelBuf)

      // 3. Run MLKit Selfie Segmentation synchronously.
      val seg = ensureSegmenter()
      val inputImage = InputImage.fromBitmap(inputBmp, 0)
      val rawMask = Tasks.await(seg.process(inputImage))

      val maskBuffer = rawMask.buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
      val maskW = rawMask.width
      val maskH = rawMask.height

      // 4. Convert FloatBuffer -> ARGB int[] -> Bitmap -> GL texture.
      val outBmp = ensureMaskOutBitmap(maskW, maskH)
      val outPixels = IntArray(maskW * maskH)
      maskBuffer.rewind()
      for (i in 0 until maskW * maskH) {
        val c = (maskBuffer.get().coerceIn(0f, 1f) * 255f + 0.5f).toInt() and 0xFF
        outPixels[i] = (0xFF shl 24) or (c shl 16) or (c shl 8) or c
      }
      outBmp.setPixels(outPixels, 0, maskW, 0, 0, maskW, maskH)

      // 5. Upload to the cached mask GL texture.
      ensureMaskTexture(maskW, maskH)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTextureId)
      android.opengl.GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, outBmp, 0)
      GlDebug.check("mask upload texImage2D")

      return maskTextureId
    } catch (t: Throwable) {
      Log.e(
        TAG,
        "Mask.produce failed; effect will fall through. sourceTex=$source2D ${sourceWidth}x${sourceHeight}",
        t,
      )
      return -1
    }
  }

  /**
   * Release all GL and MLKit resources. Call from the GL thread.
   */
  fun release() {
    try {
      if (maskTextureId != 0) {
        GLES30.glDeleteTextures(1, intArrayOf(maskTextureId), 0)
        maskTextureId = 0
      }
      downsampleFbo?.delete()
      downsampleFbo = null
      downsampleProgram?.delete()
      downsampleProgram = null
      segmenter?.close()
      segmenter = null
    } catch (t: Throwable) {
      Log.w(TAG, "Mask.release encountered an error; resources may leak", t)
    }
  }

  private fun ensureSegmenter(): Segmenter {
    val existing = segmenter
    if (existing != null) return existing
    val seg = Segmentation.getClient(
      SelfieSegmenterOptions.Builder()
        .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
        .build(),
    )
    segmenter = seg
    return seg
  }

  private fun ensureDownsampleFbo(w: Int, h: Int): Fbo {
    val existing = downsampleFbo
    if (existing != null && existing.width == w && existing.height == h) return existing
    existing?.delete()
    val fbo = Fbo(w, h)
    downsampleFbo = fbo
    return fbo
  }

  private fun ensureDownsampleProgram(): GlProgram {
    val existing = downsampleProgram
    if (existing != null) return existing
    // Downsample is just sampling a 2D texture at smaller viewport.
    val prog = GlProgram(Shaders.PASSTHROUGH_VERT, TWO_D_PASSTHROUGH_FRAG)
    downsampleProgram = prog
    return prog
  }

  private fun ensurePixelByteBuffer(size: Int): ByteBuffer {
    val existing = pixelByteBuffer
    if (existing != null && existing.capacity() >= size) {
      existing.rewind()
      return existing
    }
    val buf = ByteBuffer.allocateDirect(size).order(ByteOrder.nativeOrder())
    pixelByteBuffer = buf
    return buf
  }

  private fun ensureInputBitmap(w: Int, h: Int): Bitmap {
    val existing = inputBitmap
    if (existing != null && existing.width == w && existing.height == h && !existing.isRecycled) {
      return existing
    }
    existing?.recycle()
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    inputBitmap = bmp
    return bmp
  }

  private fun ensureMaskOutBitmap(w: Int, h: Int): Bitmap {
    val existing = maskOutBitmap
    if (existing != null && existing.width == w && existing.height == h && !existing.isRecycled) {
      return existing
    }
    existing?.recycle()
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    maskOutBitmap = bmp
    return bmp
  }

  private fun ensureMaskTexture(w: Int, h: Int) {
    if (maskTextureId != 0 && maskTexWidth == w && maskTexHeight == h) return
    if (maskTextureId != 0) {
      GLES30.glDeleteTextures(1, intArrayOf(maskTextureId), 0)
    }
    val ids = IntArray(1)
    GLES30.glGenTextures(1, ids, 0)
    maskTextureId = ids[0]
    maskTexWidth = w
    maskTexHeight = h
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTextureId)
    GLES30.glTexParameteri(
      GLES30.GL_TEXTURE_2D,
      GLES30.GL_TEXTURE_MIN_FILTER,
      GLES30.GL_LINEAR,
    )
    GLES30.glTexParameteri(
      GLES30.GL_TEXTURE_2D,
      GLES30.GL_TEXTURE_MAG_FILTER,
      GLES30.GL_LINEAR,
    )
    GLES30.glTexParameteri(
      GLES30.GL_TEXTURE_2D,
      GLES30.GL_TEXTURE_WRAP_S,
      GLES30.GL_CLAMP_TO_EDGE,
    )
    GLES30.glTexParameteri(
      GLES30.GL_TEXTURE_2D,
      GLES30.GL_TEXTURE_WRAP_T,
      GLES30.GL_CLAMP_TO_EDGE,
    )
  }

  companion object {
    private const val TAG = "Kaleidoscope.Mask"

    // Plain sampler2D passthrough used to downsample the camera into a
    // small FBO for segmentation. Keep separate from the OES version
    // because the OES extension requires its own #extension directive.
    private const val TWO_D_PASSTHROUGH_FRAG = """#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 oColor;
void main() {
  oColor = texture(uTex, vUv);
}
"""
  }
}
