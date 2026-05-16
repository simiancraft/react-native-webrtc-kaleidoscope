// Android blur effect: MLKit Selfie Segmentation + RenderScript Gaussian
// blur + per-pixel composite of (blurred, original, mask). Preserves rotation
// and timestamp on the way out.
//
// Pipeline per frame:
//   1. VideoFrame I420 -> ARGB IntArray -> Bitmap.
//   2. Selfie Segmentation (STREAM_MODE) -> confidence mask (FloatBuffer).
//   3. ScriptIntrinsicBlur (radius 25) on a copy of the bitmap.
//   4. lerp(blurred, original, mask) per pixel.
//   5. ARGB IntArray -> I420 -> new VideoFrame.
//
// RenderScript is deprecated on API 31+ but still supported through API 34.
// Single code path keeps minSdk 24 cheap; revisit if Google removes the
// runtime in a future release.

package com.simiancraft.kaleidoscope.effects

import android.content.Context
import android.graphics.Bitmap
import android.renderscript.Allocation
import android.renderscript.Element
import android.renderscript.RenderScript
import android.renderscript.ScriptIntrinsicBlur
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import java.nio.ByteOrder
import java.nio.FloatBuffer
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame

class BlurFactory(private val context: Context) : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = BlurProcessor(context.applicationContext)
}

@Suppress("DEPRECATION")
private class BlurProcessor(context: Context) : VideoFrameProcessor {
  private val rs: RenderScript = RenderScript.create(context)
  private val blurScript: ScriptIntrinsicBlur =
    ScriptIntrinsicBlur.create(rs, Element.U8_4(rs)).apply { setRadius(BLUR_RADIUS_PX) }

  private val segmenter: Segmenter = Segmentation.getClient(
    SelfieSegmenterOptions.Builder()
      .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
      .build(),
  )

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame {
    val src = frame.buffer.toI420() ?: return frame
    val width = src.width
    val height = src.height

    return try {
      val origPixels = i420ToArgb(src, width, height)
      val origBitmap = Bitmap.createBitmap(origPixels, width, height, Bitmap.Config.ARGB_8888)

      // MLKit's process() returns a Task; rn-webrtc invokes us on a dedicated
      // frame thread, so Tasks.await is acceptable (no UI thread blocking).
      val mask = Tasks.await(segmenter.process(InputImage.fromBitmap(origBitmap, 0)))

      val blurredBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      val inAlloc = Allocation.createFromBitmap(rs, origBitmap)
      val outAlloc = Allocation.createFromBitmap(rs, blurredBitmap)
      blurScript.setInput(inAlloc)
      blurScript.forEach(outAlloc)
      outAlloc.copyTo(blurredBitmap)
      inAlloc.destroy()
      outAlloc.destroy()

      val blurredPixels = IntArray(width * height).also {
        blurredBitmap.getPixels(it, 0, width, 0, 0, width, height)
      }

      // MLKit hands back the mask as a ByteBuffer of native-order float32
      // values (one per pixel). Re-view as a FloatBuffer so we can read
      // confidences directly.
      val maskFloats = mask.buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()

      val outPixels = compositeWithMask(
        origPixels = origPixels,
        blurredPixels = blurredPixels,
        maskBuffer = maskFloats,
        maskWidth = mask.width,
        maskHeight = mask.height,
        width = width,
        height = height,
      )

      origBitmap.recycle()
      blurredBitmap.recycle()

      val dst = JavaI420Buffer.allocate(width, height)
      argbToI420(outPixels, width, height, dst)

      VideoFrame(dst, frame.rotation, frame.timestampNs)
    } catch (e: Throwable) {
      // Pipeline failure must not kill the call. Return the unmodified frame
      // and surface enough to triage from `adb logcat`.
      Log.w(TAG, "blur pipeline failed; returning original frame", e)
      frame
    } finally {
      src.release()
    }
  }

  companion object {
    private const val TAG = "Kaleidoscope.Blur"
    private const val BLUR_RADIUS_PX = 25f
  }
}

// --- YUV / RGB helpers -------------------------------------------------------
// BT.601 integer-math conversion. Slow (per-pixel Kotlin), accepted for v0.1.

private fun i420ToArgb(buf: VideoFrame.I420Buffer, width: Int, height: Int): IntArray {
  val out = IntArray(width * height)
  val yPlane = buf.dataY
  val uPlane = buf.dataU
  val vPlane = buf.dataV
  val yStride = buf.strideY
  val uStride = buf.strideU
  val vStride = buf.strideV

  for (row in 0 until height) {
    val uvRow = row shr 1
    val yRowBase = row * yStride
    val uRowBase = uvRow * uStride
    val vRowBase = uvRow * vStride
    val outRowBase = row * width
    for (col in 0 until width) {
      val uvCol = col shr 1
      val y = (yPlane.get(yRowBase + col).toInt() and 0xFF) - 16
      val u = (uPlane.get(uRowBase + uvCol).toInt() and 0xFF) - 128
      val v = (vPlane.get(vRowBase + uvCol).toInt() and 0xFF) - 128

      val c = 298 * y
      var r = (c + 409 * v + 128) shr 8
      var g = (c - 100 * u - 208 * v + 128) shr 8
      var b = (c + 516 * u + 128) shr 8
      if (r < 0) r = 0 else if (r > 255) r = 255
      if (g < 0) g = 0 else if (g > 255) g = 255
      if (b < 0) b = 0 else if (b > 255) b = 255

      out[outRowBase + col] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }
  }
  return out
}

private fun argbToI420(pixels: IntArray, width: Int, height: Int, dst: JavaI420Buffer) {
  val yPlane = dst.dataY
  val uPlane = dst.dataU
  val vPlane = dst.dataV
  val yStride = dst.strideY
  val uStride = dst.strideU
  val vStride = dst.strideV

  for (row in 0 until height) {
    val uvRow = row shr 1
    val pixRowBase = row * width
    val yRowBase = row * yStride
    val uRowBase = uvRow * uStride
    val vRowBase = uvRow * vStride
    for (col in 0 until width) {
      val pixel = pixels[pixRowBase + col]
      val r = (pixel shr 16) and 0xFF
      val g = (pixel shr 8) and 0xFF
      val b = pixel and 0xFF

      val y = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
      yPlane.put(yRowBase + col, y.toByte())

      // Subsample U/V by sampling the top-left pixel of each 2x2 block.
      // Cheaper than averaging; visual difference is negligible for v0.1.
      if ((row and 1) == 0 && (col and 1) == 0) {
        val uvCol = col shr 1
        val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
        val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
        uPlane.put(uRowBase + uvCol, u.toByte())
        vPlane.put(vRowBase + uvCol, v.toByte())
      }
    }
  }
}

// --- Mask composite ---------------------------------------------------------

private fun compositeWithMask(
  origPixels: IntArray,
  blurredPixels: IntArray,
  maskBuffer: FloatBuffer,
  maskWidth: Int,
  maskHeight: Int,
  width: Int,
  height: Int,
): IntArray {
  val out = IntArray(width * height)
  maskBuffer.rewind()

  if (maskWidth == width && maskHeight == height) {
    for (i in 0 until width * height) {
      val confidence = maskBuffer.get()
      out[i] = lerpArgb(blurredPixels[i], origPixels[i], confidence)
    }
    return out
  }

  // Mask dimensions differ from frame dimensions; sample nearest-neighbor.
  val maskArr = FloatArray(maskWidth * maskHeight)
  maskBuffer.get(maskArr)
  for (row in 0 until height) {
    val mRow = ((row.toLong() * maskHeight) / height).toInt().coerceIn(0, maskHeight - 1)
    val mRowBase = mRow * maskWidth
    val rowBase = row * width
    for (col in 0 until width) {
      val mCol = ((col.toLong() * maskWidth) / width).toInt().coerceIn(0, maskWidth - 1)
      val confidence = maskArr[mRowBase + mCol]
      out[rowBase + col] = lerpArgb(blurredPixels[rowBase + col], origPixels[rowBase + col], confidence)
    }
  }
  return out
}

private fun lerpArgb(background: Int, foreground: Int, confidence: Float): Int {
  // Mask is foreground (person) confidence. 1.0 = full original, 0.0 = full blurred.
  val t = if (confidence < 0f) 0f else if (confidence > 1f) 1f else confidence
  val ti = 1f - t
  val bgR = (background shr 16) and 0xFF
  val bgG = (background shr 8) and 0xFF
  val bgB = background and 0xFF
  val fgR = (foreground shr 16) and 0xFF
  val fgG = (foreground shr 8) and 0xFF
  val fgB = foreground and 0xFF
  val r = (bgR * ti + fgR * t).toInt().coerceIn(0, 255)
  val g = (bgG * ti + fgG * t).toInt().coerceIn(0, 255)
  val b = (bgB * ti + fgB * t).toInt().coerceIn(0, 255)
  return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
}
