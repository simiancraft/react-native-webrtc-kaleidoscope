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
  //
  // OWNERSHIP (the iOS mask-drift fix; mirrors Android's fresh-Bitmap-per-frame):
  //   `lastMask` is always a FRESH buffer dequeued from `maskPool` below, NOT the
  //   buffer Vision returns. Vision recycles its own output buffer in place on
  //   the next `perform`, so caching it directly let the capture thread sample a
  //   buffer Vision was concurrently overwriting -> progressive corruption (the
  //   fog-of-war erosion). We memcpy Vision's output into a pool buffer and
  //   publish that. Android does the equivalent by copying MLKit's mask into a
  //   fresh Bitmap (see Mask.kt runSegmentation).
  //
  //   WHY A POOL, NOT A SHALLOW RING:
  //   The earlier fix used a 2-deep owned ring. Under R3 frame-pipelining the
  //   compositor returns the PREVIOUS frame's output and an in-flight GPU command
  //   buffer keeps the mask's MTLTexture (a zero-copy view of the published
  //   buffer) referenced across multiple cycles. A 2-deep ring writes index
  //   0,1,0,1, so the buffer published at frame N is overwritten at frame N+2 --
  //   while the GPU/compositor may still be reading it. That mid-read overwrite
  //   is the drift. A CVPixelBufferPool recycles a buffer ONLY once its refcount
  //   drops to zero, so a buffer that is still published, still wrapped as a
  //   compositor texture, or still in-flight on the GPU is never handed back out;
  //   the pool grows past its minimum if every buffer is live. This is the same
  //   safety the output-buffer pool already relies on (MetalRenderer).
  private var lastMask: CVPixelBuffer?

  // Pool of OneComponent8 mask targets. A fresh buffer is dequeued per
  // segmentation; the pool reclaims it only when no reference remains. Rebuilt
  // only when the mask dims change (e.g. targetShortSide / source dims change).
  // Worker-queue only. The pool's default min (see makeOneComponent8Pool) covers
  // the worst-case live set: up to two in-flight GPU masks (semaphore value 2),
  // the published lastMask, and the next worker-queue write target. The "no
  // reference remains" guarantee only holds because the processors keep the mask
  // CVPixelBuffer + its CVMetalTexture wrapper alive until command-buffer
  // completion via commitPipelined's keepAlive set; binding the MTLTexture alone
  // does not pin the IOSurface past encode under R3 frame-pipelining.
  private var maskPool: CVPixelBufferPool?
  private var maskPoolWidth = 0
  private var maskPoolHeight = 0

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
      // Vision's output buffer is owned and RECYCLED by the reused request on
      // the next perform. Copy it into a FRESH pool buffer before publishing, so
      // neither Vision (overwriting its own output) nor a future segmentation
      // (reusing a still-referenced buffer) can corrupt a mask the compositor or
      // an in-flight GPU command buffer is still reading. Worker-queue only.
      let fresh = try copyToFreshBuffer(observation.pixelBuffer)
      os_unfair_lock_lock(&unsafeLock)
      lastMask = fresh
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

  /// Copy Vision's recycled mask output into a FRESH OneComponent8 pool buffer
  /// and return it for publishing. The pool guarantees the dequeued buffer is not
  /// one still referenced by the compositor or an in-flight GPU command buffer.
  /// The copy honors bytes-per-row on both sides (the source and the pool buffer
  /// can have different row strides / padding), so it does not assume contiguous
  /// rows. Worker-queue only.
  private func copyToFreshBuffer(_ source: CVPixelBuffer) throws -> CVPixelBuffer {
    let width = CVPixelBufferGetWidth(source)
    let height = CVPixelBufferGetHeight(source)
    let dst = try dequeueMaskBuffer(width: width, height: height)

    CVPixelBufferLockBaseAddress(source, .readOnly)
    CVPixelBufferLockBaseAddress(dst, [])
    defer {
      CVPixelBufferUnlockBaseAddress(dst, [])
      CVPixelBufferUnlockBaseAddress(source, .readOnly)
    }

    guard let srcBase = CVPixelBufferGetBaseAddress(source),
          let dstBase = CVPixelBufferGetBaseAddress(dst) else {
      throw RendererError.pixelBufferAllocFailed(kCVReturnInvalidArgument)
    }
    let srcStride = CVPixelBufferGetBytesPerRow(source)
    let dstStride = CVPixelBufferGetBytesPerRow(dst)
    // OneComponent8: one byte per pixel; copy the live width per row, never the
    // stride, so neither side's row padding leaks into the other.
    let rowBytes = min(width, min(srcStride, dstStride))
    for row in 0..<height {
      memcpy(dstBase.advanced(by: row * dstStride),
             srcBase.advanced(by: row * srcStride),
             rowBytes)
    }
    return dst
  }

  /// Dequeue a fresh OneComponent8 mask buffer from the pool, rebuilding the
  /// pool only when the mask dims change (e.g. targetShortSide / source dims
  /// change). The pool will not recycle a buffer until every reference to it is
  /// released, so a just-published mask the compositor or GPU still holds is
  /// never handed back as the next write target. Worker-queue only.
  private func dequeueMaskBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    if maskPool == nil || maskPoolWidth != width || maskPoolHeight != height {
      maskPool = try TextureBridge.makeOneComponent8Pool(width: width, height: height)
      maskPoolWidth = width
      maskPoolHeight = height
    }
    guard let pool = maskPool else {
      throw RendererError.pixelBufferPoolCreateFailed(kCVReturnError)
    }
    return try TextureBridge.dequeueOneComponent8Buffer(from: pool)
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
