// Mask production: async MLKit Selfie Segmentation on a worker thread,
// last-known-mask cache, mask uploaded to a 2D GL texture for the composite
// shader to sample.
//
// Per-frame flow on the GL thread:
//   1. If the worker produced a new mask bitmap since the last frame,
//      upload it to the cached mask GL texture.
//   2. If no segmentation is currently in flight, render a small downsample
//      snapshot of the input, post it to the worker, set isProcessing=true.
//   3. Return the current mask GL texture handle (or -1 if no mask has
//      completed yet — caller falls through to the original frame).
//
// The worker thread is the bottleneck (~20-50 ms per MLKit call); decoupling
// it from the frame thread keeps render at the camera's frame rate while
// the mask updates ~10-20 Hz. One frame of latency on mask updates is
// acceptable for this use case.
//
// All failure paths log under Kaleidoscope.Mask and return -1 (or a stale
// mask if one was previously computed).

package com.simiancraft.kaleidoscope.segmentation

import android.graphics.Bitmap
import android.opengl.GLES30
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import com.simiancraft.kaleidoscope.EffectTuning
import com.simiancraft.kaleidoscope.gpu.Fbo
import com.simiancraft.kaleidoscope.gpu.GlDebug
import com.simiancraft.kaleidoscope.gpu.GlProgram
import com.simiancraft.kaleidoscope.gpu.Shaders
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

internal class Mask {
  private var segmenter: Segmenter? = null

  // Cached small-FBO state for the downsample pass.
  private var downsampleFbo: Fbo? = null
  private var downsampleProgram: GlProgram? = null

  // Cached output texture for the mask. Reused across frames.
  private var maskTextureId: Int = 0
  private var maskTexWidth: Int = 0
  private var maskTexHeight: Int = 0

  // Worker thread for blocking MLKit calls. Started lazily on first frame.
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

  /**
   * Per-frame mask production. Always returns immediately (no MLKit blocking
   * on the GL thread). Returns the GL texture handle of the latest available
   * mask, or -1 if no segmentation has completed yet. Callers must treat -1
   * as "no mask this frame" and fall through to the original frame.
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
   * Release MLKit + worker thread + GL resources. Call from the GL thread.
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
      val inputImage = InputImage.fromBitmap(inputBmp, 0)
      val rawMask = Tasks.await(seg.process(inputImage))

      val maskBuffer = rawMask.buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
      val maskW = rawMask.width
      val maskH = rawMask.height

      val outPixels = IntArray(maskW * maskH)
      maskBuffer.rewind()
      for (i in 0 until maskW * maskH) {
        val c = (maskBuffer.get().coerceIn(0f, 1f) * 255f + 0.5f).toInt() and 0xFF
        outPixels[i] = (0xFF shl 24) or (c shl 16) or (c shl 8) or c
      }

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

  // --- Lazy init helpers ---------------------------------------------------

  private fun ensureSegmenter(): Segmenter {
    val existing = segmenter
    if (existing != null) return existing
    val seg = Segmentation.getClient(
      SelfieSegmenterOptions.Builder()
        .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
        // Deliberately NOT enableRawSizeMask(). The raw ~256 native mask is
        // coarse; our composite threshold then crushes thin / low-confidence
        // regions (the torso reads as background). Letting MLKit upsample the
        // mask to the input image size preserves the soft confidence edge that
        // survives the threshold. enableRawSizeMask was added as a perf
        // optimization and visibly regressed Android mask quality vs the
        // original (which never set it); the FPS headroom does not justify it.
        // Do not re-add it without an on-device A/B.
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
