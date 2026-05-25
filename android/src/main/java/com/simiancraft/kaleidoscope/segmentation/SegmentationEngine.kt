// Process-wide segmentation worker. Owns the ONE MediaPipe Tasks
// ImageSegmenter and the ONE worker thread for the whole process; every Mask
// instance (one per active VideoFrameProcessor) submits through here instead of
// spinning up its own thread + segmenter.
//
// WHY THIS IS A SINGLETON: react-native-webrtc calls VideoFrameProcessorFactory
// .build() on EVERY effect switch from JS, constructing a fresh processor (and
// thus a fresh Mask) each time, and upstream has no teardown hook to dispose
// the old one. If each Mask owned a HandlerThread + ImageSegmenter, toggling
// effects would leak a thread and a native segmenter handle per switch and
// eventually OOM on a constrained device. Hoisting the thread + segmenter here
// bounds them to one-per-process regardless of how many Masks come and go.
//
// The segmenter is CPU (BitmapImageBuilder input), so sharing it across Masks
// is safe; VIDEO running mode only needs monotonically increasing timestamps,
// which a single shared counter guarantees. Per-stream temporal state (the EMA
// smoothing) stays on each Mask, so two simultaneous tracks do not blend masks.
//
// The thread and segmenter are created lazily on first submit and live for the
// process lifetime (the intended steady state: one thread, one segmenter). They
// are intentionally never torn down.

package com.simiancraft.kaleidoscope.segmentation

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.ByteBufferExtractor
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenter
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal object SegmentationEngine {
  private const val TAG = "Kaleidoscope.SegEngine"

  // Lazy, process-lived. Created on first submit, never torn down.
  private val workerThread: HandlerThread by lazy {
    HandlerThread("Kaleidoscope.MaskWorker").also { it.start() }
  }
  private val workerHandler: Handler by lazy { Handler(workerThread.looper) }

  // Worker-thread-confined state.
  private var segmenter: ImageSegmenter? = null
  private var videoTimestamp: Long = 0

  /**
   * Run segmentation for [inputBmp] off the GL thread. [inputBmp] is the
   * downsampled, bottom-up GL readback; this uprights it (the selfie model is
   * trained on upright people and does its worst on an inverted one), segments
   * it, and hands the raw foreground-confidence mask back via [onMask] in the
   * SAME upright orientation the caller's EMA/flip-back expects.
   *
   * [onMask] is invoked on the worker thread only on success. [onDone] is
   * invoked on the worker thread exactly once, success or failure, so the
   * caller can reset its in-flight throttle. [inputBmp] is recycled here.
   */
  fun submit(
    inputBmp: Bitmap,
    context: Context,
    onMask: (rawUpright: FloatArray, width: Int, height: Int) -> Unit,
    onDone: () -> Unit,
  ) {
    workerHandler.post {
      var upright: Bitmap? = null
      var mpImage: MPImage? = null
      try {
        val seg = ensureSegmenter(context)
        // The GL readback (glReadPixels reads bottom-to-top) is vertically
        // flipped (head-down). Feed the segmenter an upright copy; the caller
        // flips the mask back so the upload/composite alignment is untouched.
        // Vertical flip only, not a 180 rotate (columns are already correct).
        upright = flipVertical(inputBmp)
        mpImage = BitmapImageBuilder(upright).build()
        val result = seg.segmentForVideo(mpImage, videoTimestamp++)

        val confidenceMasks = result.confidenceMasks()
        if (!confidenceMasks.isPresent || confidenceMasks.get().isEmpty()) {
          Log.w(TAG, "segmentation produced no confidence mask")
          return@post
        }
        // General selfie segmenter: a single foreground-confidence mask
        // (float [0,1], higher = person). Copy it out of MediaPipe's buffer
        // into a plain array the caller owns.
        val maskImage = confidenceMasks.get()[0]
        val maskW = maskImage.width
        val maskH = maskImage.height
        val maskBuffer = ByteBufferExtractor.extract(maskImage)
          .order(ByteOrder.nativeOrder())
          .asFloatBuffer()
        val raw = FloatArray(maskW * maskH)
        maskBuffer.rewind()
        maskBuffer.get(raw)
        onMask(raw, maskW, maskH)
      } catch (t: Throwable) {
        Log.e(TAG, "segmentation failed on worker", t)
      } finally {
        // close() in finally: if segmentForVideo throws, the MPImage native
        // handle would otherwise leak (unbounded if the error recurs per frame).
        mpImage?.close()
        upright?.recycle()
        inputBmp.recycle()
        onDone()
      }
    }
  }

  private fun ensureSegmenter(context: Context): ImageSegmenter {
    val existing = segmenter
    if (existing != null) return existing
    // Load the model as a direct ByteBuffer (setModelAssetBuffer) rather than
    // setModelAssetPath: the path variant memory-maps the asset and requires it
    // to be stored uncompressed (aaptOptions noCompress), which we cannot
    // guarantee in the CONSUMING app's build. Reading the asset into a direct
    // buffer ourselves works regardless of apk compression.
    val appContext = context.applicationContext
    val modelBytes = appContext.assets.open("selfie_segmenter.tflite").use { it.readBytes() }
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
    val seg = ImageSegmenter.createFromOptions(appContext, options)
    segmenter = seg
    return seg
  }

  /** Vertical mirror (flip across the horizontal axis). Uprights the
   * bottom-to-top glReadPixels frame before segmentation. */
  private fun flipVertical(src: Bitmap): Bitmap {
    val m = Matrix().apply { postScale(1f, -1f) }
    return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
  }
}
