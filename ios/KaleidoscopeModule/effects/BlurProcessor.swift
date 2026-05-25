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
//   5. Wrap the output buffer into an RTCVideoFrame with rotation ._0 (the
//      pixels are display-upright from ingest) and the source timestamp.
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
    let bufferW = CVPixelBufferGetWidth(input)
    let bufferH = CVPixelBufferGetHeight(input)
    guard bufferW > 0, bufferH > 0 else { return frame }

    let renderer = try ensureRenderer()

    // Step 1: ingest NV12 -> DISPLAY-UPRIGHT "original" BGRA texture. The display
    // rotation is folded into the CoreImage render here (Ingest.swift), so the
    // original is canonical and every downstream pass runs in upright screen
    // space. `width`/`height` below are the DISPLAY dims (buffer dims swapped on
    // a 90/270 frame); the rest of the pipeline (blur, segmenter, output, the
    // emitted rotation 0) is sized from them.
    let rotation = frame.rotation.rawValue
    let width = Ingest.displayWidth(bufferWidth: bufferW, bufferHeight: bufferH, rotation: rotation)
    let height = Ingest.displayHeight(bufferWidth: bufferW, bufferHeight: bufferH, rotation: rotation)
    let (originalBuffer, originalTexture) = try renderer.originalIngestTarget(
      width: width, height: height
    )
    try TextureBridge.ingest(input: input, into: originalBuffer, frameRotation: rotation)

    // Step 2: read latest mask; kick a new segmentation off the original
    // buffer (now display-upright space; the segmenter only needs a uniform
    // scale relationship to the foreground, which still holds) if the worker is
    // idle. No mask yet -> forward the original frame, matching Android's -1
    // fall-through.
    guard let maskBuffer = segmenter.latestMask() else {
      segmenter.kickIfIdle(input: originalBuffer)
      return frame
    }
    segmenter.kickIfIdle(input: originalBuffer)

    let (maskTexture, maskWrapper) = try TextureBridge.makeTexture(
      from: maskBuffer,
      cache: renderer.textureCache,
      pixelFormat: .r8Unorm,
      planeIndex: 0
    )

    // Step 3: blur kernel from EffectTuning (rebuilt only on sigma change).
    kernel.ensure(sigma: EffectTuning.blurSigma)
    // R1: blur at quarter area (half each axis), floored so the short side
    // stays >= 256px. Source and output stay full-res; the composite upscales
    // the downscaled blurred bg with the linear sampler for free.
    let shortSide = min(width, height)
    let blurTarget = max(256, Int((Double(shortSide) * 0.5).rounded()))
    let blurScale = Double(blurTarget) / Double(shortSide)
    let blurW = max(2, Int((Double(width) * blurScale).rounded()) & ~1)
    let blurH = max(2, Int((Double(height) * blurScale).rounded()) & ~1)
    let (blurA, blurB) = try renderer.blurPingPong(width: blurW, height: blurH)

    let commandBuffer = try renderer.makeCommandBuffer()
    commandBuffer.label = "Kaleidoscope.Blur"

    // Downsample pass: original -> blurA. axis=0 collapses the kernel to its
    // center tap (weights sum to 1), a plain bilinear box-average into the
    // downscaled target. Both blur passes then run in downscaled space;
    // sampling the full-res original with downscaled-spaced offsets serrates.
    try renderer.encodeBlurPass(
      commandBuffer: commandBuffer,
      source: originalTexture,
      target: blurA,
      kernel: kernel,
      axis: SIMD2<Float>(0.0, 0.0),
      label: "blur-downsample"
    )
    // Horizontal pass: blurA -> blurB.
    try renderer.encodeBlurPass(
      commandBuffer: commandBuffer,
      source: blurA,
      target: blurB,
      kernel: kernel,
      axis: SIMD2<Float>(1.0 / Float(blurW), 0.0),
      label: "blur-horizontal"
    )
    // Vertical pass: blurB -> blurA.
    try renderer.encodeBlurPass(
      commandBuffer: commandBuffer,
      source: blurB,
      target: blurA,
      kernel: kernel,
      axis: SIMD2<Float>(0.0, 1.0 / Float(blurH)),
      label: "blur-vertical"
    )

    // Step 4: composite original (fg) + blurred (bg) + mask -> output.
    let (maskLo, maskHi) = MaskTuning.smoothstepRange(
      hardness: EffectTuning.maskHardness,
      threshold: EffectTuning.maskThreshold
    )
    let output = try renderer.dequeueOutputBuffer(width: width, height: height)
    let (outputTexture, outputWrapper) = try TextureBridge.makeTexture(
      from: output,
      cache: renderer.textureCache,
      pixelFormat: .bgra8Unorm,
      planeIndex: 0
    )
    try renderer.encodeComposite(
      commandBuffer: commandBuffer,
      target: outputTexture,
      original: originalTexture,
      background: blurA,
      mask: maskTexture,
      maskUvScale: SIMD2<Float>(1, 1),
      maskUvOffset: SIMD2<Float>(0, 0),
      maskHi: maskHi,
      maskLo: maskLo,
      // RENDER-PASS-PARITY V-flip (NOT a camera-orientation term). The blurred
      // background passes through an odd number of .private render passes
      // (downsample + H + V); each Metal pass flips vertically in buffer space
      // (the transpiled passthrough does not negate gl_Position.y; see
      // MetalRenderer header), so the background arrives flipped relative to the
      // directly-sampled foreground (the composite samples uOriginal in its
      // single pass). Cancel it with a V flip of the background UV
      // (bgUv.y -> 1 - bgUv.y). This is independent of the camera: the ingest
      // normalization (Ingest.swift) handles display rotation upstream and does
      // NOT change how many ping-pong passes blur runs, so this term stays even
      // though the per-effect ORIENTATION cascade was removed. iOS-only:
      // Android's GL passes share the FBO origin and do not flip.
      // The single calibration knob for camera orientation is
      // Ingest.ROTATION_DIRECTION; do not repurpose this term for it.
      bgUvScale: SIMD2<Float>(1, -1),
      bgUvOffset: SIMD2<Float>(0, 1),
      label: "blur-composite"
    )

    // R3 frame-pipelining: commit asynchronously and return the PREVIOUS
    // frame's completed output (one frame of latency), instead of stalling on
    // waitUntilCompleted every frame. The completion handler publishes `output`
    // as ready only once the GPU finishes writing it, so the buffer we hand to
    // WebRTC is always fully rendered. Before any frame has completed, forward
    // the original frame (same fall-through as "no mask yet").
    // Keep the GPU's per-frame inputs alive until the command buffer completes.
    // The mask CVPixelBuffer (pool-owned; the worker queue may republish/reclaim
    // otherwise) and the mask + output CVMetalTexture wrappers (which pin their
    // IOSurfaces for the cache) outlive this frame's process() return under R3,
    // so they ride the completion handler. originalTexture's wrapper is retained
    // for the buffer's whole cached life by the renderer, so it is not listed.
    // The blur ping-pong textures are device-private (.storageMode private), not
    // IOSurface-backed pool buffers, and are owned by the renderer, so they need
    // no keep-alive here.
    guard let ready = renderer.commitPipelined(
      commandBuffer,
      currentOutput: output,
      keepAlive: [maskBuffer, maskWrapper, outputWrapper],
      debugTiming: EffectTuning.debugTiming,
      timingLabel: "blur"
    ) else {
      return frame
    }

    return FrameBridge.makeOutputFrame(pixelBuffer: ready, like: frame)
  }
}
