// Person-segmentation pipeline shared by the blur and background-image
// effects. Mirrors android/.../segmentation/Mask.kt in shape, swapping MLKit
// Selfie Segmentation for Apple Vision's VNGeneratePersonSegmentationRequest.
//
// THREADING (mirrors Mask.kt):
//   - A single VNGeneratePersonSegmentationRequest (qualityLevel .fast) is
//     reused across frames. It is NOT safe to run concurrently, so all
//     segmentation runs on one dedicated serial DispatchQueue.
//   - `inFlight` and `lastMask` are guarded by an os_unfair_lock.
//   - The capture thread calls `latestMask()` to read the most recent
//     completed mask immediately (returns nil if none yet -> the caller falls
//     through to the original frame, exactly like Android returning -1), then
//     calls `kickIfIdle(_:)` which posts a new segmentation only when no
//     segmentation is in flight. One frame of mask latency is acceptable.
//
// ORIENTATION DECISION (the footgun the scaffold called out):
//   We pass CGImagePropertyOrientation.up to VNImageRequestHandler. Rationale:
//   the entire pipeline (CoreImage ingest, blur, composite, output buffer)
//   operates in the camera buffer's NATIVE pixel space, and the output frame
//   preserves frame.rotation unchanged, so the display rotation is applied by
//   the consumer downstream exactly as for the unprocessed frame. Vision
//   returns the mask in the coordinate space implied by the orientation we
//   pass; passing .up means the mask is produced in native buffer space, so
//   it aligns 1:1 with our "original" texture and the composite's
//   uMaskUvScale/uMaskUvOffset stay identity (matching the Android side, which
//   feeds MLKit a buffer-space bitmap with rotation 0). This removes any
//   dependence on RTCVideoFrame.rotation or AVCaptureDevice.Position for mask
//   ALIGNMENT, which is the only property that can silently ship a transposed
//   or mirrored mask. The tradeoff: a person who is sideways in the raw buffer
//   segments slightly worse; acceptable, and identical to the Android
//   behavior. If field testing shows the segmentation quality suffers because
//   the buffer is landscape, the fix is to pass the orientation derived from
//   frame.rotation AND to apply the inverse transform to the returned mask UVs
//   in composite.metal; that is a deliberate, separate change, not a silent
//   default.

import Foundation
import CoreVideo
import Vision
import os.log

final class Segmenter {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Segmenter")

  private let workerQueue = DispatchQueue(label: "kaleidoscope.vision", qos: .userInitiated)

  // Reused across frames; created lazily on the worker queue so it is only
  // ever touched from one thread.
  private var request: VNGeneratePersonSegmentationRequest?

  private var unsafeLock = os_unfair_lock_s()
  private var inFlight = false
  // The most recent completed mask, in native buffer space. OneComponent8
  // CVPixelBuffer (0..255 confidence). Retained until replaced.
  private var lastMask: CVPixelBuffer?

  /// Read the most recent completed mask. Returns nil if none has completed
  /// yet. The returned buffer is retained by the caller for the duration of
  /// the frame; the Segmenter may replace its own reference concurrently, but
  /// CVPixelBuffer is reference-counted so the caller's copy stays valid.
  func latestMask() -> CVPixelBuffer? {
    os_unfair_lock_lock(&unsafeLock)
    defer { os_unfair_lock_unlock(&unsafeLock) }
    return lastMask
  }

  /// If no segmentation is in flight, copy the input buffer reference and post
  /// a new segmentation to the worker queue. Returns immediately. The input
  /// CVPixelBuffer is retained by the dispatched closure for the duration of
  /// the Vision call.
  func kickIfIdle(input: CVPixelBuffer) {
    os_unfair_lock_lock(&unsafeLock)
    if inFlight {
      os_unfair_lock_unlock(&unsafeLock)
      return
    }
    inFlight = true
    os_unfair_lock_unlock(&unsafeLock)

    workerQueue.async { [weak self] in
      guard let self = self else { return }
      self.runSegmentation(on: input)
    }
  }

  // MARK: - Worker queue

  private func runSegmentation(on input: CVPixelBuffer) {
    defer {
      os_unfair_lock_lock(&unsafeLock)
      inFlight = false
      os_unfair_lock_unlock(&unsafeLock)
    }
    do {
      let req = ensureRequest()
      // .up: segment in native buffer space; see the orientation decision at
      // the top of this file.
      let handler = VNImageRequestHandler(cvPixelBuffer: input, orientation: .up, options: [:])
      try handler.perform([req])
      guard let observation = req.results?.first else {
        os_log("segmentation produced no observation", log: Segmenter.log, type: .info)
        return
      }
      let maskBuffer = observation.pixelBuffer
      os_unfair_lock_lock(&unsafeLock)
      lastMask = maskBuffer
      os_unfair_lock_unlock(&unsafeLock)
    } catch {
      os_log("segmentation failed: %{public}@", log: Segmenter.log, type: .error,
             error.localizedDescription)
    }
  }

  private func ensureRequest() -> VNGeneratePersonSegmentationRequest {
    if let existing = request {
      return existing
    }
    let req = VNGeneratePersonSegmentationRequest()
    req.qualityLevel = .fast
    // OneComponent8: an 8-bit single-channel confidence mask, bindable as a
    // Metal .r8Unorm texture; composite.metal samples its .x channel.
    req.outputPixelFormat = kCVPixelFormatType_OneComponent8
    request = req
    return req
  }
}
