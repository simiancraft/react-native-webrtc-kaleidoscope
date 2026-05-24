// iOS mirror effect: horizontal flip of the camera frame.
//
// The simplest effect; no mask, no segmentation, no Metal. A single CoreImage
// horizontal flip rendered into a pooled BGRA buffer, wrapped back into an
// RTCVideoFrame preserving rotation and timestamp. "Mirror" means a SCREEN-
// horizontal flip. The effect runs in the camera's landscape buffer space and
// the display rotates it by frame.rotation, so on a portrait phone (90/270)
// the buffer's X axis maps to the screen's VERTICAL — flipping buffer-X there
// turns the image upside down. We flip the buffer axis that maps to screen-
// horizontal: buffer-Y when rotated 90/270, buffer-X otherwise. (Web flips in
// display space directly and needs no rotation handling.)
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

  // Two-name bridge for VideoFrameProcessorDelegate. The Obj-C selector is
  // `capturer:didCaptureVideoFrame:` (from VideoFrameProcessor.h), but Swift's
  // Obj-C importer trims `VideoFrame` off the label because the parameter
  // type is RTCVideoFrame (noun-trim-by-type-name). On the Swift side the
  // protocol is therefore imported as requiring `capturer(_:didCapture:)`,
  // and our function MUST use that label to satisfy Swift's conformance
  // check. The explicit @objc(...) attribute pins the EMITTED Obj-C
  // selector back to `capturer:didCaptureVideoFrame:` so the runtime
  // dispatch from VideoEffectProcessor still finds this method. Same
  // pattern in BlurProcessor and BackgroundImageProcessor.
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
    // Flip the buffer axis that maps to screen-horizontal: buffer-Y on a
    // portrait display (rotation 90/270), buffer-X otherwise. scale by -1 then
    // translate by +extent to bring the image back into [0, extent].
    let r = frame.rotation.rawValue
    let flipped: CIImage
    if r == 90 || r == 270 {
      flipped = source
        .transformed(by: CGAffineTransform(scaleX: 1, y: -1))
        .transformed(by: CGAffineTransform(translationX: 0, y: source.extent.height))
    } else {
      flipped = source
        .transformed(by: CGAffineTransform(scaleX: -1, y: 1))
        .transformed(by: CGAffineTransform(translationX: source.extent.width, y: 0))
    }

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
