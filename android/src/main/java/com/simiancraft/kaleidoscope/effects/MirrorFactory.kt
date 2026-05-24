// Android mirror effect: per-row byte-reverse on the I420 Y plane plus the
// half-resolution U and V chroma planes. Preserves rotation and timestamp.

package com.simiancraft.kaleidoscope.effects

import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import java.nio.ByteBuffer
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame

class MirrorFactory : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = MirrorProcessor()
}

private class MirrorProcessor : VideoFrameProcessor {
  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame {
    val src = frame.buffer.toI420() ?: return frame
    val width = src.width
    val height = src.height
    val chromaWidth = (width + 1) / 2
    val chromaHeight = (height + 1) / 2

    val dst = JavaI420Buffer.allocate(width, height)

    // Mirror = a screen-HORIZONTAL flip. The effect runs in the camera's
    // landscape buffer space; the display rotates by frame.rotation. On a
    // portrait phone (90/270) the buffer's X axis maps to the screen's
    // vertical, so a per-row horizontal reverse would flip the image upside
    // down. Flip the buffer axis that maps to screen-horizontal: vertical
    // (row order) when rotated 90/270, horizontal (within-row) otherwise.
    if (frame.rotation == 90 || frame.rotation == 270) {
      flipRowsVertically(src.dataY, src.strideY, dst.dataY, dst.strideY, width, height)
      flipRowsVertically(src.dataU, src.strideU, dst.dataU, dst.strideU, chromaWidth, chromaHeight)
      flipRowsVertically(src.dataV, src.strideV, dst.dataV, dst.strideV, chromaWidth, chromaHeight)
    } else {
      flipRowsHorizontally(src.dataY, src.strideY, dst.dataY, dst.strideY, width, height)
      flipRowsHorizontally(src.dataU, src.strideU, dst.dataU, dst.strideU, chromaWidth, chromaHeight)
      flipRowsHorizontally(src.dataV, src.strideV, dst.dataV, dst.strideV, chromaWidth, chromaHeight)
    }

    src.release()
    return VideoFrame(dst, frame.rotation, frame.timestampNs)
  }

  private fun flipRowsVertically(
    src: ByteBuffer,
    srcStride: Int,
    dst: ByteBuffer,
    dstStride: Int,
    width: Int,
    height: Int,
  ) {
    val rowBuf = ByteArray(width)
    for (row in 0 until height) {
      val srcRowStart = row * srcStride
      // Same row, reversed row ORDER: row r -> row (height-1-r).
      val dstRowStart = (height - 1 - row) * dstStride
      for (col in 0 until width) {
        rowBuf[col] = src.get(srcRowStart + col)
      }
      for (col in 0 until width) {
        dst.put(dstRowStart + col, rowBuf[col])
      }
    }
  }

  private fun flipRowsHorizontally(
    src: ByteBuffer,
    srcStride: Int,
    dst: ByteBuffer,
    dstStride: Int,
    width: Int,
    height: Int,
  ) {
    val rowBuf = ByteArray(width)
    for (row in 0 until height) {
      val srcRowStart = row * srcStride
      val dstRowStart = row * dstStride
      // Pull one row out of src into a local array, then write reversed into dst.
      // Local array avoids per-byte ByteBuffer dispatch in the inner loop.
      for (col in 0 until width) {
        rowBuf[col] = src.get(srcRowStart + col)
      }
      for (col in 0 until width) {
        dst.put(dstRowStart + col, rowBuf[width - 1 - col])
      }
    }
  }
}
