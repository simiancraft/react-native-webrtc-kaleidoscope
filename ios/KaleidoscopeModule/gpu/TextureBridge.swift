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

  /// Wrap a plane of a CVPixelBuffer as a zero-copy MTLTexture via the cache.
  /// For BGRA use planeIndex 0 + .bgra8Unorm; for a OneComponent8 mask use
  /// planeIndex 0 + .r8Unorm; for NV12 luma planeIndex 0 + .r8Unorm.
  static func makeTexture(
    from pixelBuffer: CVPixelBuffer,
    cache: CVMetalTextureCache,
    pixelFormat: MTLPixelFormat,
    planeIndex: Int
  ) throws -> MTLTexture {
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
    return metalTexture
  }

  /// Render the (NV12 or other) input CVPixelBuffer into the BGRA `target`
  /// buffer via CoreImage. CoreImage color-manages the YCbCr->RGB conversion
  /// from the source buffer's attachments. The CIImage Y axis: CoreImage's
  /// origin is bottom-left, but render(_:to:) writes into the destination's
  /// natural top-left memory order such that the rendered image matches the
  /// source buffer's pixel layout (no flip), which is exactly what we want so
  /// the Metal "original" texture is in the same native buffer space as the
  /// downstream output buffer.
  static func ingest(input: CVPixelBuffer, into target: CVPixelBuffer) throws {
    let image = CIImage(cvPixelBuffer: input)
    ciContext.render(
      image,
      to: target,
      bounds: image.extent,
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
  }
}
