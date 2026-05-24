// iOS geometric-transform effects: flip-x, flip-y, rotate-cw, rotate-ccw.
//
// Replaces the old MirrorProcessor. flip-x is the corrected screen-horizontal
// mirror; the other three are new. All four share ONE shader
// (transform.metalsrc) and ONE class, parameterized by an Orientation.Op. The
// camera-buffer reorientation math lives entirely in Orientation.swift; this
// processor only plumbs pixels and binds the matrix that helper returns.
//
// Per frame (on the capture thread):
//   1. Ingest the camera CVPixelBuffer (NV12) into the "original" BGRA Metal
//      texture via CoreImage (colorspace conversion only; see TextureBridge).
//   2. Compute uUvTransform = Orientation.uvTransform(op, frameRotation).
//   3. One transform render pass: original -> pooled BGRA output. For the
//      90-degree rotations the output is dimension-swapped (input w x h ->
//      output h x w); the flips keep w x h.
//   4. Wrap the output buffer into an RTCVideoFrame preserving rotation and
//      timestamp.
//
// One instance is registered per op name and shared across every frame, so all
// mutable state is guarded by an os_unfair_lock. Every failure path logs under
// Kaleidoscope.Transform and returns the ORIGINAL frame; the processor must
// never crash the capture pipeline (no debugger on EAS).
//
// No mask, no segmentation: a pure reorientation. Unlike the removed
// MirrorProcessor's CoreImage affine, this runs through the transpiled Metal
// transform shader so the same shader serves all four ops and the rotation
// correction is centralized.

import Foundation
import CoreVideo
import Metal
import simd
import os.log
import WebRTC
// Import whichever react-native-webrtc fork is present; both expose the same
// VideoFrameProcessorDelegate / ProcessorProvider symbols. See Registration.swift.
#if canImport(livekit_react_native_webrtc)
import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
import react_native_webrtc
#endif

@objc(KaleidoscopeTransformProcessor)
public final class TransformProcessor: NSObject, VideoFrameProcessorDelegate {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Transform")

  private let op: Orientation.Op

  private var unsafeLock = os_unfair_lock_s()
  // Lazily constructed on the first frame so a Metal/library failure degrades
  // to passthrough rather than crashing at registration time.
  private var renderer: MetalRenderer?
  private var rendererFailed = false

  /// `op` selects which geometric reorientation this instance applies. One
  /// instance is registered per Orientation.Op (see Registration.swift).
  init(op: Orientation.Op) {
    self.op = op
    super.init()
  }

  // Two-name bridge for VideoFrameProcessorDelegate; see MirrorProcessor's
  // (removed) note and BlurProcessor. The Obj-C selector stays
  // `capturer:didCaptureVideoFrame:` while Swift's importer requires the
  // `capturer(_:didCapture:)` label; the @objc(...) pins the emitted selector
  // back so runtime dispatch from VideoEffectProcessor finds this method.
  @objc(capturer:didCaptureVideoFrame:)
  public func capturer(
    _ capturer: RTCVideoCapturer,
    didCapture frame: RTCVideoFrame
  ) -> RTCVideoFrame {
    os_unfair_lock_lock(&unsafeLock)
    defer { os_unfair_lock_unlock(&unsafeLock) }
    do {
      return try process(frame)
    } catch {
      os_log("transform (%{public}@) failed; forwarding original. %{public}@",
             log: TransformProcessor.log, type: .error,
             op.rawValue, error.localizedDescription)
      return frame
    }
  }

  private func ensureRenderer() throws -> MetalRenderer {
    if let renderer = renderer { return renderer }
    if rendererFailed { throw RendererError.noMetalDevice }
    do {
      let created = try MetalRenderer(bundle: Bundle(for: TransformProcessor.self))
      renderer = created
      return created
    } catch {
      rendererFailed = true
      throw error
    }
  }

  private func process(_ frame: RTCVideoFrame) throws -> RTCVideoFrame {
    guard let input = FrameBridge.inputPixelBuffer(frame) else {
      // Not a CVPixelBuffer-backed frame; nothing to reorient on the GPU path.
      return frame
    }
    let width = CVPixelBufferGetWidth(input)
    let height = CVPixelBufferGetHeight(input)
    guard width > 0, height > 0 else { return frame }

    let renderer = try ensureRenderer()

    // Step 1: ingest NV12 -> "original" BGRA texture (input dims w x h).
    let (originalBuffer, originalTexture) = try renderer.originalIngestTarget(
      width: width, height: height
    )
    try TextureBridge.ingest(input: input, into: originalBuffer)

    // Step 2: the reorientation matrix, from the single-source helper.
    let uvTransform = Orientation.uvTransform(
      op: op, frameRotation: frame.rotation.rawValue
    )

    // Step 3: output dims. The 90-degree rotations swap to h x w; the flips
    // keep w x h. The transform pass reads the w x h source into the
    // (possibly swapped) output target.
    let outWidth = op.swapsDimensions ? height : width
    let outHeight = op.swapsDimensions ? width : height

    let output = try renderer.dequeueOutputBuffer(width: outWidth, height: outHeight)
    let outputTexture = try TextureBridge.makeTexture(
      from: output,
      cache: renderer.textureCache,
      pixelFormat: .bgra8Unorm,
      planeIndex: 0
    )

    let commandBuffer = try renderer.makeCommandBuffer()
    commandBuffer.label = "Kaleidoscope.Transform"
    try renderer.encodeTransform(
      commandBuffer: commandBuffer,
      source: originalTexture,
      target: outputTexture,
      uvTransform: uvTransform,
      label: "transform-\(op.rawValue)"
    )

    // Block until the GPU has finished writing `output`; the buffer is handed
    // to WebRTC synchronously on return (same contract as Blur/BgImage).
    commandBuffer.commit()
    commandBuffer.waitUntilCompleted()

    if commandBuffer.error != nil {
      throw RendererError.commandBufferUnavailable
    }

    return FrameBridge.makeOutputFrame(pixelBuffer: output, like: frame)
  }
}
