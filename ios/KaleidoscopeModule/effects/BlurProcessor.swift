// iOS blur effect. Mirrors android/.../effects/BlurFactory.kt + Mask.kt.
//
// Per frame (all on the capture thread, except segmentation which runs async
// on the Segmenter's worker queue):
//   1. Ingest the camera CVPixelBuffer (NV12) into the "original" BGRA Metal
//      texture via CoreImage (colorspace conversion only; see TextureBridge).
//   2. Read the latest completed mask; if none yet, forward the ORIGINAL frame
//      (exactly like Android returning -1). Kick a new segmentation if idle.
//   3. Two separable Gaussian passes on "original" via blur.metal (horizontal
//      then vertical) into ping-pong textures.
//   4. Composite original (foreground) + blurred (background) + mask via
//      composite.metal into a pooled BGRA output buffer. Blurred bg is the
//      same dims as original, so bg + mask UV transforms are identity.
//   5. Wrap the output buffer into an RTCVideoFrame preserving rotation and
//      timestamp.
//
// One instance is registered under "blur" and shared across every frame, so
// all mutable state is guarded by an os_unfair_lock. Every failure path logs
// under Kaleidoscope.Blur and returns the ORIGINAL frame; the processor must
// never crash the capture pipeline (no debugger on EAS).

import Foundation
import CoreVideo
import Metal
import os.log
import WebRTC
// Import whichever react-native-webrtc fork is present; both expose the same
// VideoFrameProcessorDelegate / ProcessorProvider symbols. See Registration.swift.
#if canImport(livekit_react_native_webrtc)
import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
import react_native_webrtc
#endif

@objc(KaleidoscopeBlurProcessor)
public final class BlurProcessor: NSObject, VideoFrameProcessorDelegate {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Blur")

  private var unsafeLock = os_unfair_lock_s()
  // Lazily constructed on the first frame so a Metal/library failure degrades
  // to passthrough rather than crashing at registration time.
  private var renderer: MetalRenderer?
  private var rendererFailed = false
  private let segmenter = Segmenter()
  private var kernel = BlurKernel()

  public override init() {
    super.init()
  }

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
      os_log("blur failed; forwarding original. %{public}@",
             log: BlurProcessor.log, type: .error, error.localizedDescription)
      return frame
    }
  }

  private func ensureRenderer() throws -> MetalRenderer {
    if let renderer = renderer { return renderer }
    if rendererFailed { throw RendererError.noMetalDevice }
    do {
      let created = try MetalRenderer(bundle: Bundle(for: BlurProcessor.self))
      renderer = created
      return created
    } catch {
      rendererFailed = true
      throw error
    }
  }

  private func process(_ frame: RTCVideoFrame) throws -> RTCVideoFrame {
    guard let input = FrameBridge.inputPixelBuffer(frame) else {
      return frame
    }
    let width = CVPixelBufferGetWidth(input)
    let height = CVPixelBufferGetHeight(input)
    guard width > 0, height > 0 else { return frame }

    let renderer = try ensureRenderer()

    // Step 1: ingest NV12 -> "original" BGRA texture.
    let (originalBuffer, originalTexture) = try renderer.originalIngestTarget(
      width: width, height: height
    )
    try TextureBridge.ingest(input: input, into: originalBuffer)

    // Step 2: read latest mask; kick a new segmentation off the original
    // buffer (native pixel space) if the worker is idle. No mask yet -> forward
    // the original frame, matching Android's -1 fall-through.
    guard let maskBuffer = segmenter.latestMask() else {
      segmenter.kickIfIdle(input: originalBuffer)
      return frame
    }
    segmenter.kickIfIdle(input: originalBuffer)

    let maskTexture = try TextureBridge.makeTexture(
      from: maskBuffer,
      cache: renderer.textureCache,
      pixelFormat: .r8Unorm,
      planeIndex: 0
    )

    // Step 3: blur kernel from EffectTuning (rebuilt only on sigma change).
    kernel.ensure(sigma: EffectTuning.blurSigma)
    let (blurA, blurB) = try renderer.blurPingPong(width: width, height: height)

    let commandBuffer = try renderer.makeCommandBuffer()
    commandBuffer.label = "Kaleidoscope.Blur"

    // Horizontal pass: original -> blurA.
    try renderer.encodeBlurPass(
      commandBuffer: commandBuffer,
      source: originalTexture,
      target: blurA,
      kernel: kernel,
      axis: SIMD2<Float>(1.0 / Float(width), 0.0),
      label: "blur-horizontal"
    )
    // Vertical pass: blurA -> blurB.
    try renderer.encodeBlurPass(
      commandBuffer: commandBuffer,
      source: blurA,
      target: blurB,
      kernel: kernel,
      axis: SIMD2<Float>(0.0, 1.0 / Float(height)),
      label: "blur-vertical"
    )

    // Step 4: composite original (fg) + blurred (bg) + mask -> output.
    let (maskLo, maskHi) = MaskTuning.smoothstepRange(
      hardness: EffectTuning.maskHardness,
      threshold: EffectTuning.maskThreshold
    )
    let output = try renderer.dequeueOutputBuffer(width: width, height: height)
    let outputTexture = try TextureBridge.makeTexture(
      from: output,
      cache: renderer.textureCache,
      pixelFormat: .bgra8Unorm,
      planeIndex: 0
    )
    try renderer.encodeComposite(
      commandBuffer: commandBuffer,
      target: outputTexture,
      original: originalTexture,
      background: blurB,
      mask: maskTexture,
      maskUvScale: SIMD2<Float>(1, 1),
      maskUvOffset: SIMD2<Float>(0, 0),
      maskHi: maskHi,
      maskLo: maskLo,
      bgUvScale: SIMD2<Float>(1, 1),
      bgUvOffset: SIMD2<Float>(0, 0),
      label: "blur-composite"
    )

    // Block until the GPU has finished writing `output`; the buffer is handed
    // to WebRTC synchronously on return, so we cannot let it be read before
    // the composite completes. waitUntilCompleted keeps the per-name
    // instance's single command buffer in-order and the output valid.
    commandBuffer.commit()
    commandBuffer.waitUntilCompleted()

    if commandBuffer.error != nil {
      throw RendererError.commandBufferUnavailable
    }

    return FrameBridge.makeOutputFrame(pixelBuffer: output, like: frame)
  }
}
