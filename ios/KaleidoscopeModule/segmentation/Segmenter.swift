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
//   is a UNIFORM scale of the same native buffer space (no crop, no rotation;
//   the vertical flip folded into the render is canceled by the mask flip-back,
//   see the ORIENTATION DECISION below), the composite samples the mask with
//   NORMALIZED [0,1] UVs and a LINEAR sampler, and the mask UV transform stays
//   identity (uMaskUvScale=(1,1), uMaskUvOffset=(0,0)). A lower-res mask
//   therefore upscales for free and lands on the full-res foreground 1:1. Never
//   upscales: the scale clamps to 1.0, at which the render is a same-size,
//   vertically-flipped copy (still inside the bracket, so still aligned).
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
// ORIENTATION DECISION (device-confirmed; supersedes the original "no flip"):
//   We feed the segmenter a VERTICALLY-FLIPPED (upright) buffer and flip the
//   mask back, EXACTLY as Android's Mask.kt does. This is a deterministic flip
//   bracket: a real pixel flip in, a real row flip out; the two cancel for
//   alignment, but MediaPipe (trained on upright people) now segments a head-up
//   frame. History, and why the original "no flip" call was WRONG:
//   - The original reasoning was "iOS isn't glReadPixels, the ingest is upright,
//     so no flip." That conflated the ingest with the segmenter input. The
//     segmenter input is NOT the ingest "original"; it is the DOWNSCALED scratch
//     buffer produced by TextureBridge.downscale, a CoreImage/Metal render.
//     CoreImage is a bottom-left-origin system; that render lands the content
//     vertically inverted (head-down) in the scratch buffer's top-left memory
//     order -- the glReadPixels-equivalent flip. So MPImage(pixelBuffer:) wraps a
//     head-down buffer even though the "original" is upright.
//   - Device evidence (commit 7587d1a): phone held vertical/portrait -> mask
//     grabs the ceiling / too permissive on the top half (the model's failure on
//     a head-down person); phone held SIDEWAYS (90 either way) -> mask perfect;
//     upside down -> symptoms return (iOS auto-rotates so the person is head-down
//     again). Sideways-perfect / vertical-broken is the textbook signature of a
//     vertically-flipped segmenter input. The mask still ALIGNS spatially
//     (ceiling-grab, a detection error, not an upside-down mask), so the V-flip
//     is already canceled in the upload/sample path -- same situation Android had
//     before its flipVertical fix.
//   - THE FIX (mirrors Mask.kt): TextureBridge.downscale folds a PURE vertical
//     flip (rows reversed, columns preserved -- NOT a 180 rotate) into the same
//     render, so MPImage(pixelBuffer:) receives an upright person.
//     copyMaskToFreshBuffer writes source row `row` to destination row
//     `(height - 1 - row)` (the inverse flip), so the published mask lands in the
//     SAME top-left orientation as before; the composite samples it with identity
//     UVs and the alignment is byte-for-byte unchanged from the pre-flip build.
//   This still removes any dependence on RTCVideoFrame.rotation or
//   AVCaptureDevice.Position for mask ALIGNMENT (the bracket cancels), and it
//   fixes the model's head-down detection error.

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
  // buffer space (no crop, no rotation) and the input-flip/mask-flip bracket
  // cancels (see the ORIENTATION DECISION). Retained until replaced.
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

      // Wrap the (downscaled, vertically-flipped) BGRA buffer as an MPImage. No
      // MPImage orientation argument: the flip is a DETERMINISTIC pixel flip
      // folded into TextureBridge.downscale (not an orientation hint whose mask-
      // return coordinate semantics we'd be gambling on), so MediaPipe sees an
      // upright person. The mask is flipped back in copyMaskToFreshBuffer. See the
      // ORIENTATION DECISION at the top of this file (device-confirmed; mirrors
      // Android's Mask.kt flipVertical bracket).
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

  /// Render `input` (full-res BGRA, native buffer space) into the reused scratch
  /// buffer, downscaled to EffectTuning.targetShortSide AND vertically flipped so
  /// MediaPipe sees an upright person (see the ORIENTATION DECISION + the
  /// vertical-flip rationale on TextureBridge.downscale). The flip is the input
  /// half of the deterministic flip bracket; copyMaskToFreshBuffer flips the mask
  /// back so alignment is unchanged.
  ///
  /// The render is UNCONDITIONAL: every buffer handed to MPImage passes through
  /// TextureBridge.downscale so the flip is always applied, keeping the bracket
  /// deterministic. When the source short side is already at or below the target
  /// the scale clamps to 1.0 (a same-size flipped copy; never an upscale). The
  /// only return of the unmodified `input` is the degenerate zero-dim guard,
  /// which produces no mask anyway. Worker-queue only.
  private func downscaledInput(from input: CVPixelBuffer) throws -> CVPixelBuffer {
    let srcW = CVPixelBufferGetWidth(input)
    let srcH = CVPixelBufferGetHeight(input)
    guard srcW > 0, srcH > 0 else { return input }

    let targetShort = EffectTuning.targetShortSide
    let srcShort = min(srcW, srcH)
    // Never upscale: clamp the scale to 1.0 when the source is already at or
    // below the target. At 1.0 the scratch is a same-size, vertically-flipped
    // copy; the segmenter still receives an upright buffer and the bracket holds.
    let scale = min(CGFloat(1), CGFloat(targetShort) / CGFloat(srcShort))

    let dstW: Int
    let dstH: Int
    if scale >= 1.0 {
      // Same-size copy: preserve exact source dims (no even-rounding that could
      // drop a row/column on an odd-dim source).
      dstW = srcW
      dstH = srcH
    } else {
      // Even dimensions keep CoreImage/IOSurface happy and avoid odd-row chroma
      // surprises if the buffer is ever reinterpreted.
      dstW = max(2, Int((CGFloat(srcW) * scale).rounded()) & ~1)
      dstH = max(2, Int((CGFloat(srcH) * scale).rounded()) & ~1)
    }

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
    // float32Data is a `const float *` owned by the Mask, imported as a
    // NON-optional UnsafePointer<Float> on MediaPipeTasksVision 0.10.x (EAS
    // confirmed: a conditional binding here is illegal). Valid only while `mask`
    // is alive; we read it synchronously (mask outlives this call) and never
    // cache the pointer.
    let src: UnsafePointer<Float> = mask.float32Data

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
    //
    // VERTICAL FLIP-BACK (the output half of the flip bracket; mirrors Android's
    // Mask.kt pack loop). We fed MediaPipe a vertically-flipped (upright) buffer
    // via TextureBridge.downscale, so the returned mask is in that flipped space.
    // Write each source row `row` to destination row `(height - 1 - row)` -- a
    // PURE vertical flip (rows reversed, columns preserved). The two flips cancel,
    // so the published mask lands in the SAME orientation as before; composite
    // alignment is unchanged, but MediaPipe segmented an upright person.
    for row in 0..<height {
      let srcRow = src.advanced(by: row * width)
      let dstRow = dstBytes.advanced(by: (height - 1 - row) * dstStride)
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
