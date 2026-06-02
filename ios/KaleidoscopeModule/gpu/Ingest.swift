// Ingest: the ONE place camera orientation is normalized on iOS.
//
// ===== Why this exists (read before "fixing" any effect's orientation) =====
//
// The camera hands us an RTCVideoFrame whose CVPixelBuffer is raw sensor-space
// (typically a LANDSCAPE NV12 buffer) plus a separate `frame.rotation` (0/90/
// 180/270) that the display would otherwise apply downstream. The old iOS code
// ingested the buffer with NO rotation, so the "original" BGRA texture was raw
// landscape; every effect then re-corrected orientation itself (transform ops
// conjugated screen<->buffer, the background pre-oriented through an extra
// transform pass, FrameBridge preserving frame.rotation so the consumer rotated
// the whole composite). That per-effect cascade is what this module removes.
//
// `ingest(...)` below folds `frame.rotation` INTO the CoreImage NV12->BGRA
// render, so the single ingest produces a DISPLAY-UPRIGHT "original" BGRA
// texture. The original buffer is sized with display dims (buffer dims swapped
// on a 90/270 frame), so the upright image fills it without clamping. Effects
// then emit `rotation 0` (the pixels are already upright; nothing downstream
// should re-rotate them). This mirrors android/.../gpu/Ingest.kt, which folds
// the display rotation into the OES->2D pass so its FBO is display-upright.
//
// After ingest the "original" texture is canonical: every downstream pass
// (transform mat2, background cover-fit + composite, blur, the segmentation mask
// downscale) reads an already-upright frame and applies NO further orientation
// correction.
//
// ===== Two SEPARATE concerns; do not conflate them =====
//
//   (1) DISPLAY ROTATION (this file). The camera-vs-display rotation. Lives
//       here, once. `ROTATION_DIRECTION` is the single sign knob.
//
//   (2) METAL PER-PASS V-FLIP (NOT this file). Every Metal render-to-texture
//       pass in this module flips vertically in buffer space, because the
//       transpiled spirv-cross passthrough vertex does not negate
//       gl_Position.y (see MetalRenderer header). That is a RENDER-PASS-COUNT
//       parity property, independent of the camera. The composite samples the
//       original directly in its single pass, so a single-pass effect's
//       foreground lands correct with no V term; blur's background travels
//       through extra ping-pong passes (odd parity) and so still needs its own
//       V term in the blur layer pass. The ingest is a CoreImage render, not a Metal
//       pass, so it does NOT participate in (2): it must not add a V-flip to
//       "fix" a downstream pass-parity issue. If a screenshot is upside-down,
//       decide which concern it is before touching anything.
//
// ===== Calibration (device verifies; may need one literal edit) =====
//
// ROTATION_DIRECTION below is the single sign that decides whether the display
// rotation is applied as +R or -R about the image center. If the person /
// background comes out rotated the wrong way (e.g. 90 off, or upside down on a
// 180 device), flip this sign. Nothing else in the orientation story should
// ever need touching. INGEST_V_FLIP is provided ONLY as an escape hatch in case
// the CoreImage render orientation differs from expectation on device; it should
// stay `false` (the per-pass V parity is handled downstream, not here).

import Foundation
import CoreVideo
import CoreGraphics

enum Ingest {
  // The ONE orientation calibration knob. +1 applies the display rotation as
  // +frame.rotation about the image center (CoreImage's CCW-positive
  // convention). Flip to -1 if a portrait-device screenshot shows the whole
  // frame rotated the wrong way. This is the only place orientation direction
  // is decided. (Android's analogue is Ingest.ROTATION_DIRECTION.)
  static let ROTATION_DIRECTION: CGFloat = 1.0

  // De-mirror knob. The front camera delivers a HORIZONTALLY MIRRORED buffer
  // (its CVPixelBuffer is selfie-mirrored), so a pure-rotation ingest produces a
  // mirrored "original": Flip X cancels to a no-op, Flip Y reads as a 180, and
  // the debug-grid text reads BACKWARDS. Android (MLKit, no mirror) and the web
  // reference both have a NON-mirrored canonical frame. Setting this true folds a
  // single screen-horizontal flip into the ingest so the canonical "original" is
  // NON-mirrored, matching web/Android. Applied in DISPLAY space, AFTER the rotate
  // and origin-snap (see uprightTransform step 3), so it is a true screen-
  // horizontal mirror (negate U) regardless of frame.rotation. It must NOT be
  // folded into the rotate via scaledBy: a source-space horizontal flip composed
  // with a 90/270 rotation is a diagonal reflection that swaps the U/V axes and
  // transposes flip-x with flip-y downstream.
  // Defaults to true (front-camera selfie mirror is the shipping case); flip to
  // false if a future rear-camera/source path is already un-mirrored. This is the
  // single mirror knob, the analogue of ROTATION_DIRECTION for the U axis.
  static let INGEST_MIRROR_X = true

  // Escape hatch only. The ingest is a CoreImage render, not a Metal pass, so it
  // does NOT incur the module's per-Metal-pass V-flip; this should stay false.
  // Set true ONLY if device testing shows the CoreImage ingest itself lands the
  // frame vertically inverted (in which case the per-pass parity story upstream
  // is wrong and should be re-derived, not patched here).
  static let INGEST_V_FLIP = false

  /// Normalize a frame rotation to {0, 90, 180, 270}.
  static func normalize(_ degrees: Int) -> Int { ((degrees % 360) + 360) % 360 }

  /// Does this frame rotation swap buffer dims into display dims?
  static func swaps(_ frameRotation: Int) -> Bool {
    let r = normalize(frameRotation)
    return r == 90 || r == 270
  }

  /// Display width for a buffer of `bufferWidth` x `bufferHeight` at `rotation`.
  static func displayWidth(bufferWidth: Int, bufferHeight: Int, rotation: Int) -> Int {
    swaps(rotation) ? bufferHeight : bufferWidth
  }

  /// Display height for a buffer of `bufferWidth` x `bufferHeight` at `rotation`.
  static func displayHeight(bufferWidth: Int, bufferHeight: Int, rotation: Int) -> Int {
    swaps(rotation) ? bufferWidth : bufferHeight
  }

  /// The CoreImage affine that maps the raw `sourceExtent` (buffer-space) image
  /// into a DISPLAY-UPRIGHT image whose origin is (0,0) and whose size is the
  /// display dims. The pipeline, in the order the pixels experience it:
  ///   1. rotate about the SOURCE center by ROTATION_DIRECTION * frameRotation,
  ///   2. snap the rotated bbox to the origin (now the upright DISPLAY rect),
  ///   3. THEN, in that display frame, fold in the de-mirror / V escape hatch.
  ///
  /// The mirror/V MUST be applied in display space (step 3), not folded into the
  /// rotate via `scaledBy` (step 1). `CGAffineTransform`'s builder methods PREPEND
  /// in point order, so an inline `t.scaledBy(...)` between the rotate and the
  /// inverse-center translate applies the scale to the point BEFORE the rotation,
  /// i.e. in SOURCE space. A horizontal flip in source space, composed with a
  /// 90/270 rotation, is a reflection across a DIAGONAL: it SWAPS the U and V axes
  /// of the produced texture. Downstream the transform shader negates U for flip-x
  /// and V for flip-y about an axis-aligned UV frame, so a U<->V-swapped original
  /// makes flip-x read as a vertical flip and flip-y as a horizontal mirror (the
  /// two ops transpose), and the debug grid lands rotated 90. Mirroring AFTER the
  /// rotation, about the DISPLAY center, is a clean screen-horizontal flip (negate
  /// U only) that leaves the axes aligned. (This is what the prior comment CLAIMED
  /// the code did; the composition order silently defeated it.)
  ///
  /// CoreImage is a bottom-left, CCW-positive coordinate system; this returns a
  /// transform to feed `CIImage.transformed(by:)` before `render(_:to:bounds:)`.
  static func uprightTransform(sourceExtent: CGRect, frameRotation: Int) -> CGAffineTransform {
    let r = normalize(frameRotation)
    let radians = ROTATION_DIRECTION * CGFloat(r) * .pi / 180.0

    // Step 1: rotate about the source center.
    let cx = sourceExtent.midX
    let cy = sourceExtent.midY
    var t = CGAffineTransform(translationX: cx, y: cy)
    t = t.rotated(by: radians)
    t = t.translatedBy(x: -cx, y: -cy)

    // Step 2: snap the rotated bbox to the origin so the content sits in the
    // positive quadrant; its size is now the upright DISPLAY rect.
    let rotatedBounds = sourceExtent.applying(t)
    t = t.concatenating(
      CGAffineTransform(translationX: -rotatedBounds.origin.x, y: -rotatedBounds.origin.y)
    )

    // Step 3: de-mirror / V escape hatch, IN DISPLAY SPACE. The upright content
    // now spans (0,0)..(displayW, displayH); reflect about the display center so
    // the mirror is a true screen-horizontal flip (negate U) regardless of
    // frame.rotation. Concatenated AFTER `t` (point order: rotate+snap first,
    // then this reflection), so it acts on the already-upright display frame.
    if INGEST_MIRROR_X || INGEST_V_FLIP {
      let displayW = rotatedBounds.width
      let displayH = rotatedBounds.height
      let dcx = displayW / 2
      let dcy = displayH / 2
      var mirror = CGAffineTransform(translationX: dcx, y: dcy)
      mirror = mirror.scaledBy(x: INGEST_MIRROR_X ? -1 : 1, y: INGEST_V_FLIP ? -1 : 1)
      mirror = mirror.translatedBy(x: -dcx, y: -dcy)
      t = t.concatenating(mirror)
    }

    return t
  }
}
