// RTCVideoFrame <-> CVPixelBuffer helpers shared by the GPU effects.
//
// Input:  RTCVideoFrame.buffer is an RTCCVPixelBuffer for camera frames;
//         we read its .pixelBuffer (typically NV12). Any other buffer type
//         (e.g. an I420 buffer emitted by a chained CPU effect) is not
//         GPU-ingestable here, so the caller falls through to the original
//         frame.
// Output: wrap a BGRA CVPixelBuffer in RTCCVPixelBuffer, then build an
//         RTCVideoFrame. The effects normalize camera orientation at ingest
//         (the pixels are DISPLAY-UPRIGHT by the time they reach the output
//         buffer; see Ingest.swift), so the output frame is emitted with
//         rotation ._0 — the consumer must NOT re-rotate it. Only the source
//         timestamp is preserved.

import CoreVideo
import Foundation
import WebRTC

enum FrameBridge {
    /// Extract the input CVPixelBuffer from a camera RTCVideoFrame, or nil if
    /// the buffer is not a CVPixelBuffer-backed buffer (caller forwards
    /// original).
    static func inputPixelBuffer(_ frame: RTCVideoFrame) -> CVPixelBuffer? {
        guard let cvBuffer = frame.buffer as? RTCCVPixelBuffer else {
            return nil
        }
        return cvBuffer.pixelBuffer
    }

    /// Wrap a processed BGRA buffer back into an RTCVideoFrame with rotation ._0
    /// and the source timestamp. The buffer holds DISPLAY-UPRIGHT pixels (the
    /// camera rotation was folded into the ingest; see Ingest.swift), so the
    /// emitted frame carries NO rotation and the consumer displays/encodes it
    /// as-is. The single source of camera orientation is the ingest, not here.
    static func makeOutputFrame(
        pixelBuffer: CVPixelBuffer,
        like source: RTCVideoFrame
    ) -> RTCVideoFrame {
        let rtcBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        return RTCVideoFrame(
            buffer: rtcBuffer,
            rotation: ._0,
            timeStampNs: source.timeStampNs
        )
    }
}
