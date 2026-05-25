// Mask production: GL-side adapter around the process-wide SegmentationEngine.
//
// This class owns the per-processor GL state (downsample FBO/program, mask
// texture) and the per-stream temporal-smoothing (EMA) state. The actual
// segmentation (the worker thread + the MediaPipe ImageSegmenter) lives in the
// shared SegmentationEngine, so constructing a new Mask per effect switch does
// NOT spin up a new thread or segmenter; see SegmentationEngine for why.
//
// Per-frame flow on the GL thread:
//   1. If the worker produced a new mask bitmap since the last frame,
//      upload it to the cached mask GL texture.
//   2. If no segmentation is currently in flight, render a small downsample
//      snapshot of the input and submit it to the SegmentationEngine.
//   3. Return the current mask GL texture handle (or -1 if no mask has
//      completed yet — caller falls through to the original frame).
//
// The engine hands the raw foreground-confidence mask back (on its worker
// thread) via packMask(), which applies EMA smoothing, flips the mask back into
// the bottom-up orientation the upload/composite expects (the engine segmented
// an upright copy), quantizes to 8-bit, and stages the result for upload.
//
// RESIDUAL LEAK (bounded, documented): because upstream rebuilds the processor
// per effect switch with no teardown hook, the dropped processor's GL resources
// are not freed until the EGL context is destroyed (camera stop). That includes
// this Mask's texture/FBO/program AND the dropped processor's own state (the
// blur ping-pong FBOs/programs, the YuvConverter). All of it is bounded by the
// number of switches in a session and small per item; the unbounded thread/
// segmenter accumulation that would actually OOM is gone (it moved to the
// process-lived SegmentationEngine).
//
// All failure paths log under Kaleidoscope.Mask and return -1 (or a stale
// mask if one was previously computed).

package com.simiancraft.kaleidoscope.segmentation

import android.content.Context
import android.graphics.Bitmap
import android.opengl.GLES30
import android.util.Log
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
  // Cached small-FBO state for the downsample pass.
  private var downsampleFbo: Fbo? = null
  private var downsampleProgram: GlProgram? = null

  // Cached output texture for the mask. Reused across frames.
  private var maskTextureId: Int = 0
  private var maskTexWidth: Int = 0
  private var maskTexHeight: Int = 0

  // Throttle to a single in-flight segmentation at a time. Set true on
  // kickoff (GL thread), reset false when the engine reports done.
  private val isProcessing = AtomicBoolean(false)

  // Worker -> GL thread handoff: a Bitmap ready to upload as the mask
  // texture. AtomicReference makes the read+clear (GL thread) and
  // write+read-prev (worker thread) atomic, so there is no window in which
  // both threads can observe the same bitmap reference.
  private val pendingMaskBitmap = AtomicReference<Bitmap?>(null)

  // Pre-allocated readback buffer (resized only on input-dim change).
  private var pixelByteBuffer: ByteBuffer? = null

  // Temporal-smoothing (EMA) state: the previous smoothed confidence buffer and
  // its dims. Touched only on the SegmentationEngine worker thread (packMask),
  // which is single-threaded, so no locking. (If a future change ever reads
  // these off that thread, e.g. on the GL thread, they would need @Volatile.)
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
          SegmentationEngine.submit(
            downsampleBmp,
            context,
            onMask = { raw, w, h -> packMask(raw, w, h) },
            onDone = { isProcessing.set(false) },
          )
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
   * Release this Mask's GL resources. Call from the GL thread. Does NOT touch
   * the SegmentationEngine's worker thread or segmenter (those are process-
   * lived and shared). Not currently invoked by any caller because
   * VideoFrameProcessor has no explicit teardown hook; see the file header on
   * the bounded GL leak this implies.
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
      pendingMaskBitmap.getAndSet(null)?.recycle()
      smoothedMask = null
    } catch (t: Throwable) {
      Log.w(TAG, "Mask.release encountered an error; resources may leak", t)
    }
  }

  // --- Worker thread (invoked by SegmentationEngine) -----------------------

  /**
   * Apply EMA smoothing to the raw upright confidence mask, flip it back into
   * the bottom-up orientation the upload/composite expects, quantize to 8-bit
   * RGBA, and stage it for the GL thread to upload. Runs on the engine's single
   * worker thread, so the EMA state below needs no locking.
   */
  private fun packMask(raw: FloatArray, maskW: Int, maskH: Int) {
    val pixelCount = maskW * maskH

    // Temporal smoothing (exponential moving average) across mask updates, to
    // damp shoulder-popping / edge shimmer. History resets on dim change.
    val prevSmoothed = smoothedMask
    val blend = prevSmoothed != null && smoothedMaskW == maskW && smoothedMaskH == maskH
    val smoothed = if (blend) prevSmoothed!! else FloatArray(pixelCount)

    val outPixels = IntArray(pixelCount)
    for (i in 0 until pixelCount) {
      val r = raw[i].coerceIn(0f, 1f)
      val s = if (blend) MASK_EMA_ALPHA * r + (1f - MASK_EMA_ALPHA) * smoothed[i] else r
      smoothed[i] = s
      val c = (s * 255f + 0.5f).toInt() and 0xFF
      // Flip vertically back into the orientation the upload/composite expects
      // (the engine segmented an upright copy). smoothedMask stays in upright
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

  // --- Lazy init helpers ---------------------------------------------------

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
