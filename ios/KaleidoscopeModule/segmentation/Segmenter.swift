// Person-segmentation pipeline shared by the blur and background-image
// effects. Mirrors android/.../segmentation/Mask.kt in shape, swapping MLKit
// Selfie Segmentation for Apple Vision's VNGeneratePersonSegmentationRequest.
//
// DOWNSCALE (mirrors Mask.kt's 256-px downsample; the dominant per-cycle cost):
//   The full-resolution camera buffer is downscaled to EffectTuning.target-
//   ShortSide (default 384) BEFORE the Vision request, via the shared CIContext
//   into a reused scratch buffer. Vision segmenting a 384-short-side buffer
//   costs far less than the native (e.g. 720/1080) buffer. The produced mask is
//   correspondingly lower-res. This is SAFE for alignment because the downscale
//   is a UNIFORM scale of the same native buffer space (no crop, no rotation),
//   the composite samples the mask with NORMALIZED [0,1] UVs and a LINEAR
//   sampler, and the mask UV transform stays identity (uMaskUvScale=(1,1),
//   uMaskUvOffset=(0,0)). A lower-res mask therefore upscales for free and lands
//   on the full-res foreground 1:1. EffectTuning.segmentationQuality maps to the
//   request's qualityLevel (.fast default) so a later device-tier can trade
//   quality for cost. Never upscales: a target >= the source short side is a
//   no-op pass-through of the original buffer.
//
// THREADING (mirrors Mask.kt):
//   - A single VNGeneratePersonSegmentationRequest is reused across frames; its
//     qualityLevel tracks EffectTuning.segmentationQuality. It is NOT safe to
//     run concurrently, so all segmentation (and the downscale, and the scratch
//     buffer) runs on one dedicated serial DispatchQueue.
//   - `inFlight` and `lastMask` are guarded by an os_unfair_lock.
//   - The capture thread calls `latestMask()` to read the most recent
//     completed mask immediately (returns nil if none yet -> the caller falls
//     through to the original frame, exactly like Android returning -1), then
//     calls `kickIfIdle(_:)` which posts a new segmentation only when no
//     segmentation is in flight. One frame of mask latency is acceptable.
//
// ORIENTATION DECISION (the footgun the scaffold called out):
//   We pass CGImagePropertyOrientation.up to VNImageRequestHandler. Rationale:
//   the entire pipeline operates on the "original" texture, which the ingest
//   (Ingest.swift) has already normalized to DISPLAY-UPRIGHT space; the
//   segmenter receives that upright buffer (uniformly downscaled) and the
//   composite samples mask + foreground in the same upright space with identity
//   uMaskUvScale/uMaskUvOffset. Passing .up means the mask is produced in that
//   same upright buffer space, so it aligns 1:1 with the upright foreground.
//   This removes any dependence on RTCVideoFrame.rotation or
//   AVCaptureDevice.Position for mask ALIGNMENT, the only property that can
//   silently ship a transposed or mirrored mask. As a side benefit over the old
//   landscape-buffer scheme, the person is now upright in the buffer Vision
//   sees, which segments at least as well, not worse. The downscale is still a
//   uniform scale of the same (now upright) buffer space (no crop, no further
//   rotation), so the .up argument is unchanged.

import Foundation
import CoreVideo
import Vision
import os.log

final class Segmenter {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Segmenter")
  private static let perfLog = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Perf")

  private let workerQueue = DispatchQueue(label: "kaleidoscope.vision", qos: .userInitiated)

  // Reused across frames; created lazily on the worker queue so it is only
  // ever touched from one thread.
  private var request: VNGeneratePersonSegmentationRequest?
  // Tracks the qualityLevel currently applied to `request` so a JS-driven
  // change to EffectTuning.segmentationQuality takes effect without rebuilding
  // the request object. Touched only on the worker queue.
  private var requestQuality: SegmentationQuality?

  // Reused downscale target (BGRA, IOSurface-backed). Vision accepts a BGRA
  // CVPixelBuffer directly. Allocated on first use and on any change to input
  // dims or EffectTuning.targetShortSide. Touched only on the worker queue, so
  // it needs no lock. See the downscale rationale at the top of this file.
  private var scratchBuffer: CVPixelBuffer?
  private var scratchSourceWidth = 0
  private var scratchSourceHeight = 0
  private var scratchTargetShortSide = 0

  private var unsafeLock = os_unfair_lock_s()
  private var inFlight = false
  // The most recent completed mask, in DOWNSCALED buffer space. OneComponent8
  // CVPixelBuffer (0..255 confidence). The composite samples it with a LINEAR
  // sampler and identity UVs, so a lower-res mask upscales for free; alignment
  // is preserved because the downscale is a uniform scale of the same native
  // buffer space (no crop, no rotation). Retained until replaced.
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
  /// the downscale plus the Vision call.
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

    let debugTiming = EffectTuning.debugTiming
    do {
      // Downscale the full-res input to the target short side BEFORE the Vision
      // request. This is the dominant per-cycle cost (running segmentation on
      // the native buffer); the produced mask is lower-res and the composite
      // upsamples it. `visionInput` is the downscaled scratch buffer on the
      // happy path, or the original input if scaling is unnecessary/failed.
      let ingestStart = debugTiming ? DispatchTime.now() : nil
      let visionInput = try downscaledInput(from: input)
      if debugTiming, let ingestStart = ingestStart {
        let ms = Double(DispatchTime.now().uptimeNanoseconds - ingestStart.uptimeNanoseconds) / 1_000_000
        os_log("segmentation downscale ingest: %.2f ms (%dx%d)",
               log: Segmenter.perfLog, type: .info,
               ms, CVPixelBufferGetWidth(visionInput), CVPixelBufferGetHeight(visionInput))
      }

      let req = ensureRequest()
      // .up: segment in (downscaled) native buffer space; see the orientation
      // decision at the top of this file. Uniform downscale does not change the
      // orientation argument.
      let handler = VNImageRequestHandler(cvPixelBuffer: visionInput, orientation: .up, options: [:])
      let visionStart = debugTiming ? DispatchTime.now() : nil
      try handler.perform([req])
      if debugTiming, let visionStart = visionStart {
        let ms = Double(DispatchTime.now().uptimeNanoseconds - visionStart.uptimeNanoseconds) / 1_000_000
        os_log("vision perform: %.2f ms (quality=%{public}@)",
               log: Segmenter.perfLog, type: .info,
               ms, (requestQuality ?? .fast).rawValue)
      }
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

  /// Downscale `input` (full-res BGRA, native buffer space) into the reused
  /// scratch buffer sized to EffectTuning.targetShortSide. Returns the scratch
  /// buffer, or `input` unchanged when the source is already at or below the
  /// target (no upscaling) or when scratch allocation fails (degrade to running
  /// Vision on the full buffer rather than dropping the frame). Worker-queue
  /// only.
  private func downscaledInput(from input: CVPixelBuffer) throws -> CVPixelBuffer {
    let srcW = CVPixelBufferGetWidth(input)
    let srcH = CVPixelBufferGetHeight(input)
    guard srcW > 0, srcH > 0 else { return input }

    let targetShort = EffectTuning.targetShortSide
    let srcShort = min(srcW, srcH)
    // Never upscale: a target >= the source short side is a no-op.
    guard srcShort > targetShort else { return input }

    let scale = CGFloat(targetShort) / CGFloat(srcShort)
    // Even dimensions keep CoreImage/IOSurface happy and avoid odd-row chroma
    // surprises if the buffer is ever reinterpreted.
    let dstW = max(2, Int((CGFloat(srcW) * scale).rounded()) & ~1)
    let dstH = max(2, Int((CGFloat(srcH) * scale).rounded()) & ~1)

    let target = try ensureScratchBuffer(
      sourceWidth: srcW, sourceHeight: srcH, targetShortSide: targetShort,
      dstWidth: dstW, dstHeight: dstH
    )
    try TextureBridge.downscale(input: input, into: target, scale: scale)
    return target
  }

  /// Allocate-or-reuse the scratch downscale target. Rebuilt only when the
  /// source dims or the requested short side change. Worker-queue only.
  private func ensureScratchBuffer(
    sourceWidth: Int, sourceHeight: Int, targetShortSide: Int,
    dstWidth: Int, dstHeight: Int
  ) throws -> CVPixelBuffer {
    if let existing = scratchBuffer,
       scratchSourceWidth == sourceWidth,
       scratchSourceHeight == sourceHeight,
       scratchTargetShortSide == targetShortSide {
      return existing
    }
    let buffer = try TextureBridge.makeMetalCompatibleBGRABuffer(width: dstWidth, height: dstHeight)
    scratchBuffer = buffer
    scratchSourceWidth = sourceWidth
    scratchSourceHeight = sourceHeight
    scratchTargetShortSide = targetShortSide
    return buffer
  }

  private func ensureRequest() -> VNGeneratePersonSegmentationRequest {
    let quality = EffectTuning.segmentationQuality
    if let existing = request {
      // Honor a JS-driven quality change without rebuilding the request.
      if requestQuality != quality {
        existing.qualityLevel = Segmenter.visionQuality(quality)
        requestQuality = quality
      }
      return existing
    }
    let req = VNGeneratePersonSegmentationRequest()
    req.qualityLevel = Segmenter.visionQuality(quality)
    requestQuality = quality
    // OneComponent8: an 8-bit single-channel confidence mask, bindable as a
    // Metal .r8Unorm texture; composite.metal samples its .x channel.
    req.outputPixelFormat = kCVPixelFormatType_OneComponent8
    request = req
    return req
  }

  private static func visionQuality(
    _ quality: SegmentationQuality
  ) -> VNGeneratePersonSegmentationRequest.QualityLevel {
    switch quality {
    case .fast: return .fast
    case .balanced: return .balanced
    case .accurate: return .accurate
    }
  }
}
