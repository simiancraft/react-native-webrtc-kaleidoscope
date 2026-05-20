// iOS mirror effect: horizontal flip of the camera frame.
//
// The simplest effect; no mask, no segmentation, no Metal. A single CoreImage
// horizontal flip rendered into a pooled BGRA buffer, wrapped back into an
// RTCVideoFrame preserving rotation and timestamp. The flip touches only the
// X axis (CGAffineTransform scaleX -1), so it cannot introduce a vertical
// flip; this is the verification anchor for the project's orientation
// convention (a correct mirror is horizontal-only, never upside down).
//
// One instance is registered under "mirror" and shared across every frame, so
// this class is thread-safe: its only mutable state is the reused CIContext
// and a CVPixelBufferPool, both guarded by an os_unfair_lock. Every failure
// path logs under Kaleidoscope.Mirror and returns the ORIGINAL frame so the
// capture pipeline never stalls or crashes.

import Foundation
import CoreImage
import CoreVideo
import os.log
import WebRTC
// Import whichever react-native-webrtc fork is present; both expose the same
// VideoFrameProcessorDelegate / ProcessorProvider symbols. See Registration.swift.
#if canImport(livekit_react_native_webrtc)
import livekit_react_native_webrtc
#elseif canImport(react_native_webrtc)
import react_native_webrtc
#endif

@objc(KaleidoscopeMirrorProcessor)
public final class MirrorProcessor: NSObject, VideoFrameProcessorDelegate {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Mirror")

  private var unsafeLock = os_unfair_lock_s()
  private let ciContext: CIContext
  private var pool: CVPixelBufferPool?
  private var poolWidth = 0
  private var poolHeight = 0

  public override init() {
    if let device = MTLCreateSystemDefaultDevice() {
      ciContext = CIContext(mtlDevice: device, options: [.cacheIntermediates: false])
    } else {
      ciContext = CIContext(options: [.cacheIntermediates: false])
    }
    super.init()
  }

  // Pin the exact Obj-C selector the protocol declares
  // (capturer:didCaptureVideoFrame:). Swift would otherwise import the
  // RTCVideoFrame-typed selector as capturer(_:didCapture:) by analogy with
  // RTCVideoCapturerDelegate, which would NOT satisfy this distinct protocol;
  // the explicit @objc selector removes that ambiguity.
  @objc(capturer:didCaptureVideoFrame:)
  public func capturer(
    _ capturer: RTCVideoCapturer,
    didCaptureVideoFrame frame: RTCVideoFrame
  ) -> RTCVideoFrame {
    os_unfair_lock_lock(&unsafeLock)
    defer { os_unfair_lock_unlock(&unsafeLock) }
    do {
      return try process(frame)
    } catch {
      os_log("mirror failed; forwarding original. %{public}@",
             log: MirrorProcessor.log, type: .error, error.localizedDescription)
      return frame
    }
  }

  private func process(_ frame: RTCVideoFrame) throws -> RTCVideoFrame {
    guard let input = FrameBridge.inputPixelBuffer(frame) else {
      // Not a CVPixelBuffer-backed frame; nothing to flip on the GPU path.
      return frame
    }
    let width = CVPixelBufferGetWidth(input)
    let height = CVPixelBufferGetHeight(input)
    guard width > 0, height > 0 else { return frame }

    let source = CIImage(cvPixelBuffer: input)
    // Flip horizontally about the image's vertical centerline: scale X by -1
    // then translate by +width to bring the image back into [0, width].
    let flipped = source
      .transformed(by: CGAffineTransform(scaleX: -1, y: 1))
      .transformed(by: CGAffineTransform(translationX: source.extent.width, y: 0))

    let output = try dequeueBuffer(width: width, height: height)
    ciContext.render(
      flipped,
      to: output,
      bounds: CGRect(x: 0, y: 0, width: width, height: height),
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    return FrameBridge.makeOutputFrame(pixelBuffer: output, like: frame)
  }

  private func dequeueBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    if pool == nil || poolWidth != width || poolHeight != height {
      let pixelBufferAttributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        kCVPixelBufferMetalCompatibilityKey as String: true,
      ]
      let poolAttributes: [String: Any] = [
        kCVPixelBufferPoolMinimumBufferCountKey as String: 3,
      ]
      var newPool: CVPixelBufferPool?
      let status = CVPixelBufferPoolCreate(
        kCFAllocatorDefault,
        poolAttributes as CFDictionary,
        pixelBufferAttributes as CFDictionary,
        &newPool
      )
      guard status == kCVReturnSuccess, let createdPool = newPool else {
        throw RendererError.pixelBufferPoolCreateFailed(status)
      }
      pool = createdPool
      poolWidth = width
      poolHeight = height
    }
    guard let pool = pool else {
      throw RendererError.pixelBufferPoolCreateFailed(kCVReturnError)
    }
    var pixelBuffer: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
    guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
      throw RendererError.pixelBufferAllocFailed(status)
    }
    return buffer
  }
}
