// iOS background-image effect. Mirrors android/.../effects/BackgroundImage-
// Factory.kt.
//
// Per frame:
//   1. Ingest the camera CVPixelBuffer (NV12) into the "original" BGRA Metal
//      texture via CoreImage.
//   2. Lazy-load the named WebP ("dark-office"/"light-office") from the Kaleidoscope
//      resource bundle as a Metal texture on first frame; cache it; capture
//      its aspect ratio.
//   3. Read the latest completed mask; if none yet, forward the ORIGINAL
//      frame. Kick a new segmentation if idle.
//   4. Composite original (foreground) over the PNG (background) using the
//      mask, with cover-fit on the background UVs.
//
// One instance per registered name ("background-image-dark-office" /
// "background-image-light-office"), each constructed with its asset name. The
// instance is shared across every frame, so all mutable state is guarded by
// an os_unfair_lock. Every failure path logs under Kaleidoscope.BgImage and
// returns the ORIGINAL frame.
//
// BACKGROUND ORIENTATION (V-flip parity; both platforms flip, by different means):
//   Android pre-flips the bitmap vertically before upload (OpenGL ES has no
//   UNPACK_FLIP_Y and GL texture (0,0) is bottom-left). iOS loads the WebP with
//   MTKTextureLoaderOriginTopLeft, then folds a V-flip into uBgUvScale/uBgUvOffset
//   at the composite (composed WITH the cover-fit so centering is preserved). The
//   flip is required because at Metal sample time the MTKTextureLoader texture's
//   top row lands at the opposite V end from the CoreImage-rendered "original"
//   foreground (which composites correct on-device); the two standalone-image vs.
//   CVPixelBuffer paths do NOT share a V convention despite both being "row 0 =
//   top". U is untouched (the background is never mirrored). This is texture-origin
//   parity, NOT camera orientation; see shaders/composite.frag header + PATTERNS.md.
//
// CAMERA ORIENTATION:
//   The camera rotation is normalized at ingest (Ingest.swift): the "original"
//   foreground texture is already DISPLAY-UPRIGHT and sized to the display dims.
//   The composite therefore runs entirely in upright screen space, so the static
//   PNG composites DIRECTLY with a plain cover-fit against the display aspect.
//   The old per-effect pre-orient pass (a transform.metalsrc bake that rotated
//   the PNG to undo FrameBridge's preserved frame.rotation) is gone; orientation
//   lives only in the ingest now, matching android/.../BackgroundImageFactory.kt.

import Foundation
import CoreVideo
import Metal
import MetalKit
import os.log
import WebRTC
// Import whichever react-native-webrtc fork is present; both expose the same
// VideoFrameProcessorDelegate / ProcessorProvider symbols. See Registration.swift.
#if canImport(livekit_react_native_webrtc)
import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
import react_native_webrtc
#endif

@objc(KaleidoscopeBackgroundImageProcessor)
public final class BackgroundImageProcessor: NSObject, VideoFrameProcessorDelegate {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "BgImage")

  private let assetName: String

  private var unsafeLock = os_unfair_lock_s()
  private var renderer: MetalRenderer?
  private var rendererFailed = false
  private let segmenter = Segmenter()

  private var backgroundTexture: MTLTexture?
  private var backgroundAspect: Float = 1.0
  private var backgroundLoadFailed = false

  @objc public init(assetName: String) {
    self.assetName = assetName
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
      os_log("bgImage failed (asset %{public}@); forwarding original. %{public}@",
             log: BackgroundImageProcessor.log, type: .error,
             assetName, error.localizedDescription)
      return frame
    }
  }

  private func ensureRenderer() throws -> MetalRenderer {
    if let renderer = renderer { return renderer }
    if rendererFailed { throw RendererError.noMetalDevice }
    do {
      let created = try MetalRenderer(bundle: Bundle(for: BackgroundImageProcessor.self))
      renderer = created
      return created
    } catch {
      rendererFailed = true
      throw error
    }
  }

  /// Lazy-load the WebP from the Kaleidoscope bundle as a Metal texture (decoded
  /// via ImageIO, which supports WebP on iOS 14+; the podspec floors iOS 15).
  /// Caches success and failure so a missing asset degrades to passthrough
  /// without retrying every frame.
  private func ensureBackgroundTexture(device: MTLDevice) -> MTLTexture? {
    if let tex = backgroundTexture { return tex }
    if backgroundLoadFailed { return nil }

    let containing = Bundle(for: BackgroundImageProcessor.self)
    let resourceBundle = Bundle.kaleidoscopeResources(relativeTo: containing) ?? containing
    guard let url = resourceBundle.url(
      forResource: assetName, withExtension: "webp", subdirectory: "backgrounds"
    ) ?? resourceBundle.url(forResource: assetName, withExtension: "webp") else {
      os_log("background asset %{public}@.webp not found in bundle",
             log: BackgroundImageProcessor.log, type: .error, assetName)
      backgroundLoadFailed = true
      return nil
    }

    let loader = MTKTextureLoader(device: device)
    let options: [MTKTextureLoader.Option: Any] = [
      // Top-left origin so PNG row 0 (top) -> texture row 0; matches the
      // composite vUv convention. See the file header.
      .origin: MTKTextureLoader.Origin.topLeft,
      .SRGB: false,
      .textureUsage: NSNumber(value: MTLTextureUsage.shaderRead.rawValue),
      .textureStorageMode: NSNumber(value: MTLStorageMode.private.rawValue),
    ]
    do {
      let tex = try loader.newTexture(URL: url, options: options)
      backgroundTexture = tex
      backgroundAspect = Float(tex.width) / Float(max(tex.height, 1))
      os_log("background asset %{public}@ loaded: %dx%d aspect=%.3f",
             log: BackgroundImageProcessor.log, type: .info,
             assetName, tex.width, tex.height, backgroundAspect)
      return tex
    } catch {
      os_log("background asset %{public}@ load failed: %{public}@",
             log: BackgroundImageProcessor.log, type: .error,
             assetName, error.localizedDescription)
      backgroundLoadFailed = true
      return nil
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

    guard let backgroundTexture = ensureBackgroundTexture(device: renderer.device) else {
      // Asset unavailable; forward original instead of compositing onto
      // nothing.
      return frame
    }

    // Step 1: ingest NV12 -> DISPLAY-UPRIGHT "original" BGRA texture. The display
    // rotation is folded in here (Ingest.swift); `width`/`height` are the DISPLAY
    // dims (buffer dims swapped on a 90/270 frame). The composite then runs in
    // upright screen space and the PNG composites directly.
    let rotation = frame.rotation.rawValue
    let width = Ingest.displayWidth(bufferWidth: bufferW, bufferHeight: bufferH, rotation: rotation)
    let height = Ingest.displayHeight(bufferWidth: bufferW, bufferHeight: bufferH, rotation: rotation)
    let (originalBuffer, originalTexture) = try renderer.originalIngestTarget(
      width: width, height: height
    )
    try TextureBridge.ingest(input: input, into: originalBuffer, frameRotation: rotation)

    // Step 2: latest mask or forward original.
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

    // Cover-fit the background UVs against the DISPLAY aspect. The original is
    // already display-upright and the composite output is the display dims
    // (width x height), so the frame the user sees has aspect width/height with
    // no further axis swap; cover-fit the upright PNG against it directly. Port
    // of BackgroundImageFactory.kt now that iOS runs in upright screen space.
    let outAspect = Float(width) / Float(height)
    let bgAspect = backgroundAspect
    let bgUvScale: SIMD2<Float>
    let bgUvOffset: SIMD2<Float>
    if bgAspect > outAspect {
      let scaleX = outAspect / bgAspect
      bgUvScale = SIMD2<Float>(scaleX, 1.0)
      bgUvOffset = SIMD2<Float>((1.0 - scaleX) * 0.5, 0.0)
    } else {
      let scaleY = bgAspect / outAspect
      bgUvScale = SIMD2<Float>(1.0, scaleY)
      bgUvOffset = SIMD2<Float>(0.0, (1.0 - scaleY) * 0.5)
    }

    // V-flip parity for the MTKTextureLoader-loaded background, composed WITH
    // the cover-fit above (do not clobber it). The composite samples every
    // texture at plain vUv and the convention is "semantic top of source at
    // GL v=1". The CoreImage/CVPixelBuffer "original" foreground lands that way
    // and is correct on-device; the MTKTextureLoader texture does NOT match it
    // at sample time (its top row lands at vUv.y=0, the opposite end), so the
    // background renders vertically inverted without this flip. Folding the
    // flip into the cover-fit UVs is the same mechanism iOS blur uses to carry
    // its parity flip (uBgUvScale=(1,-1)); see shaders/composite.frag header and
    // PATTERNS.md. The composite computes bgUv = vUv*scale + offset, so the
    // cover-fit window is bgUv.y in [offset.y, offset.y+scale.y]. To flip V
    // while keeping THAT SAME window centered, negate scale.y and set
    // offset.y' = offset.y + scale.y (maps vUv.y=0 to the window's far edge and
    // vUv.y=1 to its near edge). NB: the common "offset.y = 1 - offset.y"
    // shorthand is only exact when scale.y == 1 (the letterbox-on-X branch); in
    // the letterbox-on-Y branch scale.y < 1 and that shorthand would shift the
    // crop, so use offset.y + scale.y, which is exact for both branches. U is
    // untouched: the background never goes through ingest and is not mirrored,
    // matching the foreground.
    let flippedBgUvScale = SIMD2<Float>(bgUvScale.x, -bgUvScale.y)
    let flippedBgUvOffset = SIMD2<Float>(bgUvOffset.x, bgUvOffset.y + bgUvScale.y)

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

    let commandBuffer = try renderer.makeCommandBuffer()
    commandBuffer.label = "Kaleidoscope.BgImage"
    try renderer.encodeComposite(
      commandBuffer: commandBuffer,
      target: outputTexture,
      original: originalTexture,
      // The PNG composites DIRECTLY (no pre-orient bake): it is sampled in the
      // same single composite pass as uOriginal. Camera orientation was handled
      // at ingest. It still needs a single V-flip parity term on uBgUvScale/
      // Offset (folded above) because the MTKTextureLoader texture's top row
      // lands at the opposite V end from the CoreImage "original" foreground at
      // sample time; that flip is texture-origin parity, NOT camera orientation.
      background: backgroundTexture,
      mask: maskTexture,
      maskUvScale: SIMD2<Float>(1, 1),
      maskUvOffset: SIMD2<Float>(0, 0),
      maskHi: maskHi,
      maskLo: maskLo,
      bgUvScale: flippedBgUvScale,
      bgUvOffset: flippedBgUvOffset,
      label: "bgImage-composite"
    )
    // R3 frame-pipelining: commit asynchronously and return the PREVIOUS
    // frame's completed output (one frame of latency); see BlurProcessor and
    // MetalRenderer.commitPipelined. Before any frame has completed, forward
    // the original frame.
    // Keep the GPU's per-frame inputs alive until the command buffer completes;
    // see BlurProcessor for the full rationale. The mask CVPixelBuffer plus the
    // mask + output CVMetalTexture wrappers outlive process()'s return under R3.
    // The background MTLTexture is loaded once via MTKTextureLoader and cached on
    // this instance (not a pool buffer, no CVMetalTexture wrapper), so it needs
    // no keep-alive. originalTexture's wrapper is held by the renderer.
    guard let ready = renderer.commitPipelined(
      commandBuffer,
      currentOutput: output,
      keepAlive: [maskBuffer, maskWrapper, outputWrapper],
      debugTiming: EffectTuning.debugTiming,
      timingLabel: "bgImage"
    ) else {
      return frame
    }

    return FrameBridge.makeOutputFrame(pixelBuffer: ready, like: frame)
  }
}
