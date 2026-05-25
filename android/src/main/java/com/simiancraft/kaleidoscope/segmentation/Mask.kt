// Mask production: async MediaPipe Tasks ImageSegmenter on a worker thread,
// last-known-mask cache, mask uploaded to a 2D GL texture for the composite
// shader to sample.
//
// SPIKE: this replaces the MLKit SelfieSegmenter (preserved unreferenced as
// Mask.kt.old) with MediaPipe Tasks. MediaPipe is the same model family web
// uses and is more configurable; MLKit was at its ~256 model ceiling on Android.
// Only the segmenter guts changed — the GL downsample -> worker -> EMA -> upload
// -> composite pipeline is identical, and we still feed the upright downsampled
// Bitmap (so orientation is unchanged: MediaPipe sees the same input MLKit did).
// See spike-mediapipe-android-segmentation.md.
//
// Per-frame flow on the GL thread:
//   1. If the worker produced a new mask bitmap since the last frame,
//      upload it to the cached mask GL texture.
//   2. If no segmentation is currently in flight, render a small downsample
//      snapshot of the input, post it to the worker, set isProcessing=true.
//   3. Return the current mask GL texture handle (or -1 if no mask has
//      completed yet — caller falls through to the original frame).
//
// All failure paths log under Kaleidoscope.Mask and return -1 (or a stale
// mask if one was previously computed).

package com.simiancraft.kaleidoscope.segmentation

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.opengl.GLES30
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.ByteBufferExtractor
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenter
import com.simiancraft.kaleidoscope.EffectTuning
import com.simiancraft.kaleidoscope.gpu.Fbo
import com.simiancraft.kaleidoscope.gpu.GlDebug
import com.simiancraft.kaleidoscope.gpu.GlProgram
import com.simiancraft.kaleidoscope.gpu.Shaders
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

internal class Mask(private val context: Context) {
  private var segmenter: ImageSegmenter? = null

  // VIDEO running mode requires monotonically increasing timestamps; a plain
  // counter guarantees that regardless of wall-clock resolution.
  private var videoTimestamp: Long = 0

  // Cached small-FBO state for the downsample pass.
  private var downsampleFbo: Fbo? = null
  private var downsampleProgram: GlProgram? = null

  // Cached output texture for the mask. Reused across frames.
  private var maskTextureId: Int = 0
  private var maskTexWidth: Int = 0
  private var maskTexHeight: Int = 0

  // Worker thread for blocking segmentation calls. Started lazily on first frame.
  private val workerThread: HandlerThread = HandlerThread("Kaleidoscope.MaskWorker").apply {
    start()
  }
  private val workerHandler: Handler = Handler(workerThread.looper)

  // Throttle to a single in-flight segmentation at a time. Set true on
  // kickoff (GL thread), reset false when the worker finishes.
  private val isProcessing = AtomicBoolean(false)

  // Worker -> GL thread handoff: a Bitmap ready to upload as the mask
  // texture. AtomicReference makes the read+clear (GL thread) and
  // write+read-prev (worker thread) atomic, so there is no window in which
  // both threads can observe the same bitmap reference.
  private val pendingMaskBitmap = AtomicReference<Bitmap?>(null)

  // Pre-allocated readback buffer (resized only on input-dim change).
  private var pixelByteBuffer: ByteBuffer? = null

  // Temporal-smoothing (EMA) state: the previous smoothed confidence buffer and
  // its dims. Worker-thread only, so no locking.
  private var smoothedMask: FloatArray? = null
  private var smoothedMaskW: Int = 0
  private var smoothedMaskH: Int = 0

  /**
   * Per-frame mask production. Always returns immediately (no segmentation
   * blocking on the GL thread). Returns the GL texture handle of the latest
   * available mask, or -1 if no segmentation has completed yet. Callers must
   * treat -1 as "no mask this frame" and fall through to the original frame.
   */
  fun produce(
    source2D: Int,
    sourceWidth: Int,
    sourceHeight: Int,
  ): Int {
    // Step 1: drain any pending mask the worker has produced. getAndSet
    // claims the bitmap atomically; the GL thread is now its sole owner.
    val pending = pendingMaskBitmap.getAndSet(null)
    if (pending != null) {
      try {
        uploadMaskBitmap(pending)
      } catch (t: Throwable) {
        Log.e(TAG, "uploadMaskBitmap failed", t)
      } finally {
        pending.recycle()
      }
    }

    // Step 2: kick off a new segmentation if the worker is idle.
    if (isProcessing.compareAndSet(false, true)) {
      try {
        val downsampleBmp =
          renderAndReadback(source2D, sourceWidth, sourceHeight, EffectTuning.targetShortSide)
        if (downsampleBmp != null) {
          workerHandler.post { runSegmentation(downsampleBmp) }
        } else {
          isProcessing.set(false)
        }
      } catch (t: Throwable) {
        Log.e(TAG, "Mask kickoff failed", t)
        isProcessing.set(false)
      }
    }

    return if (maskTextureId == 0) -1 else maskTextureId
  }

  /**
   * Release segmenter + worker thread + GL resources. Call from the GL thread.
   * Not currently invoked by any caller because VideoFrameProcessor has no
   * explicit teardown hook; worker thread leaks for the app's lifetime.
   */
  fun release() {
    try {
      workerThread.quitSafely()
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
      pendingMaskBitmap.getAndSet(null)?.recycle()
      smoothedMask = null
    } catch (t: Throwable) {
      Log.w(TAG, "Mask.release encountered an error; resources may leak", t)
    }
  }

  // --- GL thread -----------------------------------------------------------

  private fun renderAndReadback(
    source2D: Int,
    sourceWidth: Int,
    sourceHeight: Int,
    downsampleSize: Int,
  ): Bitmap? {
    return try {
      val dsW = downsampleSize
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

      val byteCount = dsW * dsH * 4
      val pixelBuf = ensurePixelByteBuffer(byteCount)
      GLES30.glReadPixels(0, 0, dsW, dsH, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, pixelBuf)

      val bmp = Bitmap.createBitmap(dsW, dsH, Bitmap.Config.ARGB_8888)
      pixelBuf.rewind()
      bmp.copyPixelsFromBuffer(pixelBuf)
      bmp
    } catch (t: Throwable) {
      Log.e(TAG, "renderAndReadback failed", t)
      null
    }
  }

  private fun uploadMaskBitmap(bmp: Bitmap) {
    ensureMaskTexture(bmp.width, bmp.height)
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTextureId)
    android.opengl.GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0)
    GlDebug.check("mask upload texImage2D")
  }

  // --- Worker thread -------------------------------------------------------

  private fun runSegmentation(inputBmp: Bitmap) {
    try {
      val seg = ensureSegmenter()
      // The GL readback (glReadPixels reads bottom-to-top) hands us a VERTICALLY
      // FLIPPED (head-down) frame. The segmenter is trained on upright people and
      // does its worst on an inverted one (device-confirmed: holding the phone
      // upside down made the mask near-perfect). Feed it an upright copy; the
      // mask is flipped back below so the working upload/composite alignment is
      // untouched. NOTE: vertical flip only, not a 180 rotate (glReadPixels does
      // not reverse columns, so left/right is already correct).
      val upright = flipVertical(inputBmp)
      val mpImage = BitmapImageBuilder(upright).build()
      // VIDEO mode: blocking, returns synchronously (drop-in for the old MLKit
      // Tasks.await).
      val result = seg.segmentForVideo(mpImage, videoTimestamp++)
      mpImage.close()
      upright.recycle()

      val confidenceMasks = result.confidenceMasks()
      if (!confidenceMasks.isPresent || confidenceMasks.get().isEmpty()) {
        Log.w(TAG, "segmentation produced no confidence mask")
        return
      }
      // General selfie segmenter: a single foreground-confidence mask (float
      // [0,1], higher = person), matching the old MLKit convention.
      val maskImage = confidenceMasks.get()[0]
      val maskW = maskImage.width
      val maskH = maskImage.height
      val pixelCount = maskW * maskH
      val maskBuffer = ByteBufferExtractor.extract(maskImage)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()

      // Temporal smoothing (exponential moving average) across mask updates, to
      // damp shoulder-popping / edge shimmer. History resets on dim change.
      // Worker-thread only, so no locking.
      val prevSmoothed = smoothedMask
      val blend = prevSmoothed != null && smoothedMaskW == maskW && smoothedMaskH == maskH
      val smoothed = if (blend) prevSmoothed!! else FloatArray(pixelCount)

      val outPixels = IntArray(pixelCount)
      maskBuffer.rewind()
      for (i in 0 until pixelCount) {
        val raw = maskBuffer.get().coerceIn(0f, 1f)
        val s = if (blend) MASK_EMA_ALPHA * raw + (1f - MASK_EMA_ALPHA) * smoothed[i] else raw
        smoothed[i] = s
        val c = (s * 255f + 0.5f).toInt() and 0xFF
        // Flip vertically back into the orientation the upload/composite expects
        // (we segmented an upright copy above). smoothedMask stays in upright
        // space for frame-to-frame EMA consistency; only the output is flipped.
        val row = i / maskW
        val col = i - row * maskW
        outPixels[(maskH - 1 - row) * maskW + col] = (0xFF shl 24) or (c shl 16) or (c shl 8) or c
      }
      smoothedMask = smoothed
      smoothedMaskW = maskW
      smoothedMaskH = maskH

      val outBmp = Bitmap.createBitmap(maskW, maskH, Bitmap.Config.ARGB_8888)
      outBmp.setPixels(outPixels, 0, maskW, 0, 0, maskW, maskH)

      // Hand off to GL thread. getAndSet atomically claims any previously
      // unconsumed bitmap as `prev` so we own the recycle; the GL thread
      // can never observe the same reference we are about to free.
      val prev = pendingMaskBitmap.getAndSet(outBmp)
      prev?.recycle()
    } catch (t: Throwable) {
      Log.e(TAG, "runSegmentation failed on worker", t)
    } finally {
      inputBmp.recycle()
      isProcessing.set(false)
    }
  }

  /** Vertical mirror (flip across the horizontal axis). Used to upright the
   * bottom-to-top glReadPixels frame before segmentation. */
  private fun flipVertical(src: Bitmap): Bitmap {
    val m = Matrix().apply { postScale(1f, -1f) }
    return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
  }

  // --- Lazy init helpers ---------------------------------------------------

  private fun ensureSegmenter(): ImageSegmenter {
    val existing = segmenter
    if (existing != null) return existing
    // Load the model as a direct ByteBuffer (setModelAssetBuffer) rather than
    // setModelAssetPath: the path variant memory-maps the asset and requires it
    // to be stored uncompressed (aaptOptions noCompress), which we cannot
    // guarantee in the CONSUMING app's build. Reading the asset into a direct
    // buffer ourselves works regardless of apk compression.
    val modelBytes = context.assets.open("selfie_segmenter.tflite").use { it.readBytes() }
    val modelBuffer = ByteBuffer.allocateDirect(modelBytes.size).order(ByteOrder.nativeOrder())
    modelBuffer.put(modelBytes)
    modelBuffer.rewind()

    val baseOptions = BaseOptions.builder()
      .setModelAssetBuffer(modelBuffer)
      .build()
    val options = ImageSegmenter.ImageSegmenterOptions.builder()
      .setBaseOptions(baseOptions)
      .setRunningMode(RunningMode.VIDEO)
      .setOutputConfidenceMasks(true)
      .setOutputCategoryMask(false)
      .build()
    val seg = ImageSegmenter.createFromOptions(context, options)
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
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
  }

  companion object {
    private const val TAG = "Kaleidoscope.Mask"

    // EMA weight for the new mask vs history. Higher = more responsive, lower =
    // smoother (more lag). 0.5 is ~a 1-2 update time constant at the ~10-20 Hz
    // mask rate: damps flicker without obvious lag.
    private const val MASK_EMA_ALPHA = 0.5f

    private const val TWO_D_PASSTHROUGH_FRAG = """#version 300 es
precision mediump float;
uniform sampler2D uTex;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  oColor = texture(uTex, vUv);
}
"""
  }
}
