// CVPixelBuffer <-> MTLTexture plumbing, plus the NV12 -> BGRA ingestion of
// the camera frame.
//
// INGESTION CHOICE (justified):
//   RTCVideoFrame's buffer is typically NV12 (420YpCbCr8BiPlanarFullRange).
//   The transpiled effect shaders expect an RGB texture. Two options were
//   considered:
//     (a) Bind the NV12 luma + chroma planes via CVMetalTextureCache and run
//         a YUV->RGB conversion pass with the correct BT.601/709 full/video
//         range matrix.
//     (b) One-shot CoreImage render of the input CVPixelBuffer into a BGRA
//         IOSurface buffer, which CoreImage color-manages correctly (it reads
//         the buffer's attached YCbCrMatrix/ColorPrimaries), then bind that
//         BGRA buffer as the "original" Metal texture.
//   We choose (b). It is materially simpler and robust: CoreImage handles the
//   range/matrix selection from the buffer's attachments, so we cannot ship a
//   subtly wrong color matrix, and it is analogous to Android sampling the OES
//   external texture into a 2D RGB FBO before any effect runs. The project
//   constraint that "GLSL is the source of truth; do NOT reimplement effects
//   in CoreImage" is honored: CoreImage is used ONLY for the colorspace/format
//   conversion at ingest; blur and composite still run through the transpiled
//   Metal shaders. The CIContext is created once and reused (a per-frame
//   CIContext() is the classic camera-filter perf failure; ~5-20 ms each).
//
// All buffers are IOSurface-backed and Metal-compatible so the same backing
// store can be both a CoreImage render target and a zero-copy MTLTexture.

import Foundation
import Metal
import CoreVideo
import CoreImage
import os.log

enum TextureBridge {
  private static let perfLog = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Perf")

  // Reused across all frames and all processors in this process. CIContext is
  // thread-safe for rendering. Backed by the system default Metal device so
  // its render targets share the IOSurface path with our textures.
  private static let ciContext: CIContext = {
    if let device = MTLCreateSystemDefaultDevice() {
      return CIContext(mtlDevice: device, options: [.cacheIntermediates: false])
    }
    return CIContext(options: [.cacheIntermediates: false])
  }()

  /// Allocate a single BGRA, IOSurface-backed, Metal-compatible CVPixelBuffer.
  static func makeMetalCompatibleBGRABuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    let attrs: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
      kCVPixelBufferMetalCompatibilityKey as String: true,
    ]
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(
      kCFAllocatorDefault, width, height,
      kCVPixelFormatType_32BGRA, attrs as CFDictionary, &buffer
    )
    guard status == kCVReturnSuccess, let result = buffer else {
      throw RendererError.pixelBufferAllocFailed(status)
    }
    return result
  }

  /// Allocate a single OneComponent8, IOSurface-backed, Metal-compatible
  /// CVPixelBuffer, bindable as an .r8Unorm Metal texture the composite samples
  /// on the .r channel. (The Segmenter now dequeues mask buffers from a pool;
  /// see makeOneComponent8Pool. This single-buffer allocator is retained as a
  /// general utility.)
  static func makeMetalCompatibleOneComponent8Buffer(width: Int, height: Int) throws -> CVPixelBuffer {
    let attrs: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_OneComponent8,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
      kCVPixelBufferMetalCompatibilityKey as String: true,
    ]
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(
      kCFAllocatorDefault, width, height,
      kCVPixelFormatType_OneComponent8, attrs as CFDictionary, &buffer
    )
    guard status == kCVReturnSuccess, let result = buffer else {
      throw RendererError.pixelBufferAllocFailed(status)
    }
    return result
  }

  /// Create a CVPixelBufferPool of OneComponent8, IOSurface-backed, Metal-
  /// compatible buffers. The Segmenter dequeues a FRESH mask buffer per
  /// segmentation from this pool, so a buffer is never overwritten while the
  /// compositor (or an in-flight GPU command buffer) still references it: the
  /// pool recycles a buffer only once its refcount drops to zero. This mirrors
  /// Android allocating a fresh Bitmap per segmentation; it replaces the old
  /// shallow owned-ring, which under R3 frame-pipelining could overwrite a mask
  /// still being read (the mask-drift race).
  ///
  /// The pool's no-recycle-while-referenced guarantee only holds if the consumer
  /// actually keeps a reference for the GPU's whole read window. It does NOT do
  /// so by binding the MTLTexture alone; the IOSurface pin lives on the
  /// CVMetalTexture wrapper, and under R3 the command buffer that samples the
  /// mask is still in flight after the encoding frame returns. The processors
  /// therefore hand the mask CVPixelBuffer AND its CVMetalTexture wrapper to
  /// commitPipelined's keepAlive set (see MetalRenderer.commitPipelined), so the
  /// buffer stays referenced until addCompletedHandler fires; only then can the
  /// pool reclaim it. `minimumBufferCount` sizes the worst-case live set: up to
  /// two in-flight GPU masks (the in-flight semaphore is value 2), the published
  /// `lastMask`, and the next worker-queue write target -> 5 with headroom.
  static func makeOneComponent8Pool(
    width: Int, height: Int, minimumBufferCount: Int = 5
  ) throws -> CVPixelBufferPool {
    let pixelBufferAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_OneComponent8,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
      kCVPixelBufferMetalCompatibilityKey as String: true,
    ]
    let poolAttributes: [String: Any] = [
      kCVPixelBufferPoolMinimumBufferCountKey as String: minimumBufferCount,
    ]
    var pool: CVPixelBufferPool?
    let status = CVPixelBufferPoolCreate(
      kCFAllocatorDefault,
      poolAttributes as CFDictionary,
      pixelBufferAttributes as CFDictionary,
      &pool
    )
    guard status == kCVReturnSuccess, let result = pool else {
      throw RendererError.pixelBufferPoolCreateFailed(status)
    }
    return result
  }

  /// Dequeue one OneComponent8 buffer from `pool`. The buffer is owned by the
  /// caller; the pool keeps it out of rotation until every reference (the
  /// published `lastMask`, the compositor's MTLTexture view, the in-flight GPU
  /// command buffer) is released. Allocation-light on the steady state.
  static func dequeueOneComponent8Buffer(from pool: CVPixelBufferPool) throws -> CVPixelBuffer {
    var pixelBuffer: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
    guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
      throw RendererError.pixelBufferAllocFailed(status)
    }
    return buffer
  }

  /// Wrap a plane of a CVPixelBuffer as a zero-copy MTLTexture via the cache,
  /// returning BOTH the MTLTexture and the CVMetalTexture wrapper.
  ///
  /// LIFETIME (the mask-drift race fix): the CVMetalTexture wrapper is what ties
  /// the vended MTLTexture to the CVPixelBuffer's IOSurface. Per Apple's
  /// CVMetalTextureCache contract, the wrapper must stay alive until the GPU has
  /// finished sampling the MTLTexture; releasing it after encode (before the
  /// command buffer completes) lets the cache reassign the texture's backing on a
  /// later create-from-image for the same surface, and lets the source pool
  /// reclaim and overwrite the surface mid-GPU-read. Under R3 frame-pipelining
  /// the command buffer is in flight after the encoding frame returns, so callers
  /// MUST hand the wrapper (and the source CVPixelBuffer for pooled buffers) to
  /// commitPipelined's keepAlive set so both live until addCompletedHandler fires.
  /// For BGRA use planeIndex 0 + .bgra8Unorm; for a OneComponent8 mask use
  /// planeIndex 0 + .r8Unorm; for NV12 luma planeIndex 0 + .r8Unorm.
  static func makeTexture(
    from pixelBuffer: CVPixelBuffer,
    cache: CVMetalTextureCache,
    pixelFormat: MTLPixelFormat,
    planeIndex: Int
  ) throws -> (texture: MTLTexture, wrapper: CVMetalTexture) {
    let width: Int
    let height: Int
    if CVPixelBufferGetPlaneCount(pixelBuffer) > 0 {
      width = CVPixelBufferGetWidthOfPlane(pixelBuffer, planeIndex)
      height = CVPixelBufferGetHeightOfPlane(pixelBuffer, planeIndex)
    } else {
      width = CVPixelBufferGetWidth(pixelBuffer)
      height = CVPixelBufferGetHeight(pixelBuffer)
    }
    var cvTexture: CVMetalTexture?
    let status = CVMetalTextureCacheCreateTextureFromImage(
      kCFAllocatorDefault,
      cache,
      pixelBuffer,
      nil,
      pixelFormat,
      width,
      height,
      planeIndex,
      &cvTexture
    )
    guard status == kCVReturnSuccess,
          let cvTex = cvTexture,
          let metalTexture = CVMetalTextureGetTexture(cvTex) else {
      throw RendererError.textureCacheCreateFailed(status)
    }
    return (metalTexture, cvTex)
  }

  /// Render the (NV12 or other) input CVPixelBuffer into the BGRA `target`
  /// buffer via CoreImage, FOLDING IN the display rotation derived from
  /// `frameRotation` so the produced "original" texture is DISPLAY-UPRIGHT.
  /// This is the single place camera orientation is normalized on iOS (see
  /// Ingest.swift). CoreImage color-manages the YCbCr->RGB conversion from the
  /// source buffer's attachments.
  ///
  /// `target` must be sized to the DISPLAY dims (buffer dims swapped on a
  /// 90/270 frame); the caller obtains those from Ingest.displayWidth/Height.
  /// The render bounds are the full target rect at origin (0,0), and the
  /// upright transform snaps the rotated content into that rect, so the buffer
  /// fills with no letterboxing.
  ///
  /// On the V axis: CoreImage's origin is bottom-left, but render(_:to:) writes
  /// into the destination's natural top-left memory order such that the rendered
  /// image matches the (now rotation-normalized) layout. The Metal per-pass
  /// V-flip is a SEPARATE concern handled downstream, NOT here (see Ingest.swift
  /// header, concern (2)).
  static func ingest(input: CVPixelBuffer, into target: CVPixelBuffer, frameRotation: Int) throws {
    let debugTiming = EffectTuning.debugTiming
    let start = debugTiming ? DispatchTime.now() : nil
    let image = CIImage(cvPixelBuffer: input)
    let transform = Ingest.uprightTransform(
      sourceExtent: image.extent, frameRotation: frameRotation
    )
    let upright = image.transformed(by: transform)
    let targetW = CVPixelBufferGetWidth(target)
    let targetH = CVPixelBufferGetHeight(target)
    ciContext.render(
      upright,
      to: target,
      bounds: CGRect(x: 0, y: 0, width: CGFloat(targetW), height: CGFloat(targetH)),
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    if debugTiming, let start = start {
      // render(_:to:bounds:colorSpace:) submits and (for this overload) waits on
      // the calling (capture) thread, so this wall-time is a fair proxy for the
      // per-frame ingest cost. Reported alongside the GPU and Vision timings to
      // locate the bottleneck on the next EAS build.
      let ms = Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000
      os_log("ingest NV12->BGRA: %.2f ms", log: TextureBridge.perfLog, type: .info, ms)
    }
  }

  /// Render `input` downscaled by `scale` into the BGRA `target` buffer, whose
  /// dimensions are the already-scaled output size. Used by the Segmenter to
  /// hand MediaPipe a smaller buffer than the camera native resolution; the
  /// produced mask is lower-res and the composite upsamples it. Reuses the
  /// shared CIContext (a per-frame CIContext is the classic camera-filter perf
  /// failure). `target` must be allocated by the caller and reused across
  /// frames (see Segmenter's scratch buffer) to keep this allocation-light.
  ///
  /// VERTICAL FLIP (device-confirmed; see Segmenter.swift ORIENTATION DECISION):
  /// the produced scratch buffer is fed to MediaPipe, which is trained on upright
  /// people. This CoreImage render lands the content vertically inverted (head-
  /// down) in the target's top-left memory order, the glReadPixels-equivalent of
  /// Android's bottom-to-top readback, so we fold a PURE vertical flip (mirror
  /// across the horizontal axis: rows reversed, columns preserved -- NOT a 180
  /// rotate) into the same render. The Segmenter flips the mask back row-for-row
  /// in copyMaskToFreshBuffer, so the two flips cancel for alignment while
  /// MediaPipe now segments an upright person. This function has exactly one
  /// caller (Segmenter.downscaledInput); the flip is private to the segmentation
  /// path and perturbs no other consumer.
  static func downscale(input: CVPixelBuffer, into target: CVPixelBuffer, scale: CGFloat) throws {
    let scaled = CIImage(cvPixelBuffer: input)
      .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    // Pure vertical flip about the scaled extent's center. Reflecting about the
    // center (translate-to-center, scaleY: -1, translate-back) leaves the
    // extent's origin and size unchanged, so the render `bounds` below is still
    // the scaled extent; columns (U) are untouched, only rows (V) reverse. This
    // mirrors the Ingest.uprightTransform step-3 idiom; do NOT replace it with a
    // bare `scaleY: -1`, which would send the extent into negative Y and require
    // a separate translate-up to keep the bounds correct.
    let extent = scaled.extent
    var vflip = CGAffineTransform(translationX: 0, y: extent.midY)
    vflip = vflip.scaledBy(x: 1, y: -1)
    vflip = vflip.translatedBy(x: 0, y: -extent.midY)
    let image = scaled.transformed(by: vflip)
    let targetW = CVPixelBufferGetWidth(target)
    let targetH = CVPixelBufferGetHeight(target)
    // Render the scaled image starting at its origin into the full target
    // rect. The scaled extent matches the target dims (caller computes both
    // from the same scale), so this fills the buffer with no letterboxing.
    ciContext.render(
      image,
      to: target,
      bounds: CGRect(x: image.extent.origin.x, y: image.extent.origin.y,
                     width: CGFloat(targetW), height: CGFloat(targetH)),
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
  }
}
