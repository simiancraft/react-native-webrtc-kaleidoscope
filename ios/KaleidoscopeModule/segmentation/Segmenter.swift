// Person-segmentation pipeline shared by every iOS effect that needs a
// mask. Mirrors android/.../segmentation/Mask.kt in shape:
//
// Planned implementation:
//   - Dedicated serial DispatchQueue(label: "kaleidoscope.vision",
//     qos: .userInitiated) for Vision request execution.
//   - NSLock-guarded `inFlight: Bool` and `lastMask: CIImage?` state.
//   - The capture thread reads `lastMask` immediately each frame; if
//     `inFlight` is false, posts a new VNGeneratePersonSegmentationRequest
//     (qualityLevel: .fast) to the worker queue and sets `inFlight = true`.
//     The worker writes `lastMask` and clears `inFlight` when finished.
//   - VNImageRequestHandler is created per frame with the correct
//     CGImagePropertyOrientation for the camera position; Vision aligns
//     the mask to the image, so no manual V-flip is needed (unlike the
//     Android side with MLKit). The orientation argument must be derived
//     from RTCVideoFrame.rotation plus the source AVCaptureDevice.Position;
//     rn-webrtc's rotation is the post-rotation display angle, not the
//     raw sensor orientation, so the mapping is non-trivial and is the
//     easiest place for an implementer to silently produce a transposed
//     mask.
//   - Reuse a single VNGeneratePersonSegmentationRequest across frames;
//     it is not safe to run concurrently from multiple threads, but serial
//     reuse on the worker queue is supported.

import Foundation
import CoreImage
import Vision

public final class Segmenter {
}
