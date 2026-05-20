// RTCVideoFrame <-> CVPixelBuffer helpers shared by the GPU effects.
//
// Input:  RTCVideoFrame.buffer is an RTCCVPixelBuffer for camera frames;
//         we read its .pixelBuffer (typically NV12). Any other buffer type
//         (e.g. an I420 buffer emitted by a chained CPU effect) is not
//         GPU-ingestable here, so the caller falls through to the original
//         frame.
// Output: wrap a BGRA CVPixelBuffer in RTCCVPixelBuffer, then build an
//         RTCVideoFrame preserving the source rotation and timestamp.

import Foundation
import CoreVideo
import WebRTC

enum FrameBridge {
  /// Extract the input CVPixelBuffer from a camera RTCVideoFrame, or nil if
  /// the buffer is not a CVPixelBuffer-backed buffer (caller forwards
  /// original).
  static func inputPixelBuffer(_ frame: RTCVideoFrame) -> CVPixelBuffer? {
    guard let cvBuffer = frame.buffer as? RTCCVPixelBuffer else {
      return nil
    }
    return cvBuffer.pixelBuffer
  }

  /// Wrap a processed BGRA buffer back into an RTCVideoFrame, preserving the
  /// source frame's rotation and timestamp so downstream display/encode is
  /// unchanged relative to the unprocessed frame.
  static func makeOutputFrame(
    pixelBuffer: CVPixelBuffer,
    like source: RTCVideoFrame
  ) -> RTCVideoFrame {
    let rtcBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
    return RTCVideoFrame(
      buffer: rtcBuffer,
      rotation: source.rotation,
      timeStampNs: source.timeStampNs
    )
  }
}
