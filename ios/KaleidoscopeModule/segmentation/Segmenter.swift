// Person-segmentation pipeline shared by the blur and background-image
// effects. Mirrors android/.../segmentation/Mask.kt: MediaPipe Tasks
// ImageSegmenter (VIDEO running mode, confidence masks, selfie_segmenter.tflite),
// replacing the earlier Apple Vision VNGeneratePersonSegmentationRequest. The
// model is the same family the web (MediaPipe Selfie Segmentation) and Android
// (MediaPipe Tasks) sides use, so all three platforms run identical segmentation
// math and the iOS-specific Vision "fog of war" mask drift is gone by
// construction.
//
// DOWNSCALE (mirrors Mask.kt's 256-px downsample; the dominant per-cycle cost):
//   The full-resolution camera buffer is downscaled to EffectTuning.target-
//   ShortSide (default 384) BEFORE the segment call, via the shared CIContext
//   into a reused BGRA scratch buffer. Segmenting a 384-short-side buffer costs
//   far less than the native (e.g. 720/1080) buffer. MediaPipe resizes the
//   confidence mask back to the INPUT dims it was given, so the produced mask is
//   correspondingly lower-res. This is SAFE for alignment because the downscale
//   is a UNIFORM scale of the same native buffer space (no crop, no rotation),
//   the composite samples the mask with NORMALIZED [0,1] UVs and a LINEAR
//   sampler, and the mask UV transform stays identity (uMaskUvScale=(1,1),
//   uMaskUvOffset=(0,0)). A lower-res mask therefore upscales for free and lands
//   on the full-res foreground 1:1. Never upscales: a target >= the source short
//   side is a no-op pass-through of the original buffer.
//
// THREADING (mirrors Mask.kt):
//   - A single ImageSegmenter is reused across frames; ImageSegmenter is NOT
//     safe to run concurrently, so all segmentation (and the downscale, and the
//     scratch buffer) runs on one dedicated serial DispatchQueue.
//   - `inFlight` and `lastMask` are guarded by an os_unfair_lock.
//   - The capture thread calls `latestMask()` to read the most recent completed
//     mask immediately (returns nil if none yet -> the caller falls through to
//     the original frame, exactly like Android returning -1), then calls
//     `kickIfIdle(_:)` which posts a new segmentation only when no segmentation
//     is in flight. One frame of mask latency is acceptable.
//   - VIDEO running mode requires monotonically increasing timestamps; a plain
//     counter guarantees that regardless of wall-clock resolution (same as
//     Android's videoTimestamp++).
//
// ORIENTATION DECISION (the footgun the scaffold called out):
//   We feed the segmenter the SAME upright (downscaled) buffer the Vision path
//   did, and we do NOT flip the mask. Rationale:
//   - The entire pipeline operates on the "original" texture, which the ingest
//     (Ingest.swift) has already normalized to DISPLAY-UPRIGHT space; the
//     segmenter receives that upright buffer (uniformly downscaled).
//   - Android flips its segmenter INPUT (flipVertical) and flips the mask back,
//     but ONLY because its "original" comes from glReadPixels, which reads
//     bottom-to-top and hands the worker a vertically-inverted (head-down)
//     frame. iOS has no glReadPixels: the "original" is a CoreImage/Metal ingest
//     that is already display-upright (person head-up). So the Android flip is
//     ANDROID-SPECIFIC and is deliberately NOT copied here.
//   - MPImage(pixelBuffer:) wraps the CVPixelBuffer in its natural top-left
//     memory order; the returned confidence mask is in that same buffer space,
//     row 0 = top. The composite samples the mask with identity UVs in the same
//     upright top-left space it samples the foreground. So the mask lands 1:1 on
//     the upright foreground with NO flip, exactly as the Vision OneComponent8
//     mask did. (Contrast Vision, whose output buffer was likewise top-left;
//     the swap is segmenter-for-segmenter, the coordinate origin is unchanged.)
//   This removes any dependence on RTCVideoFrame.rotation or
//   AVCaptureDevice.Position for mask ALIGNMENT.

import Foundation
import CoreVideo
import MediaPipeTasksVision
import os.log

final class Segmenter {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Segmenter")
  private static let perfLog = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Perf")

  // Name of the bundled TFLite model (ships in Kaleidoscope.bundle via the
  // podspec resource_bundles glob; mirrors Android's assets/selfie_segmenter.tflite).
  private static let modelName = "selfie_segmenter"
  private static let modelExtension = "tflite"

  private let workerQueue = DispatchQueue(label: "kaleidoscope.segmenter", qos: .userInitiated)

  // Reused across frames; created lazily on the worker queue so it is only ever
  // touched from one thread. ImageSegmenter is not safe to run concurrently.
  private var segmenter: ImageSegmenter?
  // True once we have attempted (and failed) to build the segmenter, so we stop
  // retrying every cycle and just degrade to the last mask. Worker-queue only.
  private var segmenterFailed = false

  // VIDEO running mode requires monotonically increasing timestamps. A plain
  // counter (ms units) guarantees that regardless of wall-clock resolution.
  // Worker-queue only. Mirrors Android's videoTimestamp++.
  private var videoTimestampMs: Int = 0

  // Reused downscale target (BGRA, IOSurface-backed). MPImage accepts a
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
  //   `lastMask` is always a FRESH buffer dequeued from `maskPool` below, NOT a
  //   buffer MediaPipe owns. MediaPipe's MPMask (Swift name `Mask`) is owned by
  //   the underlying C++ task and is only valid for the lifetime of the result;
  //   its `float32Data` pointer must not be cached. We read float32Data into a
  //   pool buffer (converting to 0..255 OneComponent8) and publish that. Android
  //   does the equivalent by copying the mask into a fresh Bitmap (Mask.kt
  //   runSegmentation).
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
  // only when the mask dims change. Worker-queue only. The pool's default min
  // (see makeOneComponent8Pool) covers the worst-case live set: up to two
  // in-flight GPU masks (semaphore value 2), the published lastMask, and the
  // next worker-queue write target. The "no reference remains" guarantee only
  // holds because the processors keep the mask CVPixelBuffer + its CVMetalTexture
  // wrapper alive until command-buffer completion via commitPipelined's keepAlive
  // set; binding the MTLTexture alone does not pin the IOSurface past encode
  // under R3 frame-pipelining.
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
  /// the downscale plus the segment call.
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
      guard let segmenter = ensureSegmenter() else {
        // Build already failed and logged once; degrade to the last mask.
        return
      }

      // Downscale the full-res input to the target short side BEFORE the segment
      // call. This is the dominant per-cycle cost; the produced mask is lower-res
      // and the composite upsamples it. `segInput` is the downscaled scratch
      // buffer on the happy path, or the original input if scaling is
      // unnecessary/failed.
      let ingestStart = debugTiming ? DispatchTime.now() : nil
      let segInput = try downscaledInput(from: input)
      if debugTiming, let ingestStart = ingestStart {
        let ms = Double(DispatchTime.now().uptimeNanoseconds - ingestStart.uptimeNanoseconds) / 1_000_000
        os_log("segmentation downscale ingest: %.2f ms (%dx%d)",
               log: Segmenter.perfLog, type: .info,
               ms, CVPixelBufferGetWidth(segInput), CVPixelBufferGetHeight(segInput))
      }

      // Wrap the downscaled BGRA buffer as an MPImage. No orientation argument:
      // the buffer is already display-upright (Ingest.swift) and MediaPipe wraps
      // it in natural top-left memory order; see the orientation decision at the
      // top of this file (iOS needs NO flip, unlike Android's glReadPixels path).
      let mpImage = try MPImage(pixelBuffer: segInput)

      let segStart = debugTiming ? DispatchTime.now() : nil
      // VIDEO mode: synchronous, returns the result directly. Monotonic ms
      // timestamp (mirrors Android's videoTimestamp++).
      let result = try segmenter.segment(
        videoFrame: mpImage, timestampInMilliseconds: videoTimestampMs
      )
      videoTimestampMs += 1
      if debugTiming, let segStart = segStart {
        let ms = Double(DispatchTime.now().uptimeNanoseconds - segStart.uptimeNanoseconds) / 1_000_000
        os_log("mediapipe segment: %.2f ms", log: Segmenter.perfLog, type: .info, ms)
      }

      // General selfie segmenter: a single foreground-confidence mask (float
      // [0,1], higher = person), matching the Android (confidenceMasks[0]) and
      // web conventions. confidenceMasks is nil/empty if the model produced
      // nothing this cycle.
      guard let mask = result.confidenceMasks?.first else {
        os_log("segmentation produced no confidence mask", log: Segmenter.log, type: .info)
        return
      }

      // Copy MediaPipe's float32 confidence mask into a FRESH pool buffer
      // (converting to 0..255 OneComponent8) before publishing. MediaPipe's
      // MPMask is owned by the C++ task and its float32Data pointer is valid only
      // for the result's lifetime; the pool guarantees the dequeued OneComponent8
      // buffer is not one the compositor or an in-flight GPU command buffer still
      // references. Worker-queue only.
      let fresh = try copyMaskToFreshBuffer(mask)
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
  /// the segmenter on the full buffer rather than dropping the frame).
  /// Worker-queue only.
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

  /// Copy MediaPipe's float32 confidence mask into a FRESH OneComponent8 pool
  /// buffer and return it for publishing. The float32 values are foreground
  /// confidence in [0, 1]; we clamp and quantize to 0..255 so the composite can
  /// sample the buffer as an .r8Unorm texture on its .r channel (identical to the
  /// OneComponent8 buffer the Vision path produced). The pool guarantees the
  /// dequeued buffer is not one still referenced by the compositor or an in-flight
  /// GPU command buffer. The write honors the destination's bytes-per-row (the
  /// pool buffer can have row padding), so it does not assume contiguous rows.
  /// Worker-queue only.
  // `MediaPipeTasksVision.Mask` is the Swift name of MPPMask (NS_SWIFT_NAME(Mask));
  // it is fully qualified because `Mask` is generic enough to collide.
  private func copyMaskToFreshBuffer(_ mask: MediaPipeTasksVision.Mask) throws -> CVPixelBuffer {
    let width = mask.width
    let height = mask.height
    guard width > 0, height > 0 else {
      throw RendererError.pixelBufferAllocFailed(kCVReturnInvalidArgument)
    }
    // float32Data is a `const float *` owned by the Mask (imported as an
    // implicitly-unwrapped UnsafePointer<Float>); valid only while `mask` is
    // alive. We read it synchronously here (mask outlives this call) and never
    // cache the pointer. Guard the IUO so a (nominally impossible) nil degrades
    // to the last mask rather than trapping the worker.
    guard let src: UnsafePointer<Float> = mask.float32Data else {
      throw RendererError.pixelBufferAllocFailed(kCVReturnInvalidArgument)
    }

    let dst = try dequeueMaskBuffer(width: width, height: height)
    CVPixelBufferLockBaseAddress(dst, [])
    defer { CVPixelBufferUnlockBaseAddress(dst, []) }

    guard let dstBase = CVPixelBufferGetBaseAddress(dst) else {
      throw RendererError.pixelBufferAllocFailed(kCVReturnInvalidArgument)
    }
    let dstStride = CVPixelBufferGetBytesPerRow(dst)
    let dstBytes = dstBase.assumingMemoryBound(to: UInt8.self)

    // MediaPipe's float32 mask is tightly packed, row-major, `width` floats per
    // row (no row padding). OneComponent8 is one byte per pixel; write the live
    // width per row into the destination at its own stride, so the pool buffer's
    // row padding (if any) never gets confidence bytes and never leaks into the
    // next row.
    for row in 0..<height {
      let srcRow = src.advanced(by: row * width)
      let dstRow = dstBytes.advanced(by: row * dstStride)
      for col in 0..<width {
        let confidence = min(max(srcRow[col], 0.0), 1.0)
        dstRow[col] = UInt8(confidence * 255.0 + 0.5)
      }
    }
    return dst
  }

  /// Dequeue a fresh OneComponent8 mask buffer from the pool, rebuilding the
  /// pool only when the mask dims change. The pool will not recycle a buffer
  /// until every reference to it is released, so a just-published mask the
  /// compositor or GPU still holds is never handed back as the next write target.
  /// Worker-queue only.
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

  /// Build-or-return the reused ImageSegmenter. Returns nil if a prior build
  /// failed (logged once) or this build fails; the caller degrades to the last
  /// mask rather than dropping the pipeline. VIDEO running mode + confidence
  /// masks + CPU delegate (default) match the Android side (Mask.kt
  /// ensureSegmenter). Worker-queue only.
  private func ensureSegmenter() -> ImageSegmenter? {
    if let existing = segmenter { return existing }
    if segmenterFailed { return nil }

    // Resolve selfie_segmenter.tflite from the same Kaleidoscope.bundle the
    // background presets and shaders load from, using the project's shared
    // resolver (autolinked nested bundle, else the static-link fallback). This
    // mirrors BackgroundImageProcessor's resource lookup exactly.
    let containing = Bundle(for: Segmenter.self)
    let resourceBundle = Bundle.kaleidoscopeResources(relativeTo: containing) ?? containing
    guard let modelURL = resourceBundle.url(
      forResource: Segmenter.modelName, withExtension: Segmenter.modelExtension
    ) else {
      segmenterFailed = true
      os_log("segmenter model %{public}@.%{public}@ not found in bundle",
             log: Segmenter.log, type: .error,
             Segmenter.modelName, Segmenter.modelExtension)
      return nil
    }
    let modelPath = modelURL.path

    do {
      let options = ImageSegmenterOptions()
      options.baseOptions.modelAssetPath = modelPath
      options.runningMode = .video
      options.shouldOutputConfidenceMasks = true
      options.shouldOutputCategoryMask = false
      let created = try ImageSegmenter(options: options)
      segmenter = created
      return created
    } catch {
      segmenterFailed = true
      os_log("ImageSegmenter init failed: %{public}@", log: Segmenter.log, type: .error,
             error.localizedDescription)
      return nil
    }
  }
}
