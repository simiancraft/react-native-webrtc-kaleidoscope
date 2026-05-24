// Orientation: maps a screen-space reorientation op to the simd_float2x2 the
// transform.metalsrc fragment multiplies into UV about the 0.5 center. All four
// ops (flip-x, flip-y, rotate-cw, rotate-ccw) call uvTransform(op:); none
// re-derive anything, and none depend on the camera rotation.
//
// ===== Pure screen space (read before "fixing") =====
//
// Camera orientation is normalized ONCE upstream, in Ingest (Ingest.swift): the
// CoreImage ingest folds the display rotation into the NV12->BGRA render, so by
// the time transform.metalsrc samples the "original" texture it is already
// DISPLAY-UPRIGHT. The op matrices are therefore pure SCREEN SPACE and do NOT
// depend on frame.rotation:
//   flip-x (screen-horizontal mirror, head stays up) -> negate U
//   flip-y (screen-vertical flip, upside down)        -> negate V
//   rotate-cw / rotate-ccw                            -> swap axes (+ a sign)
// These match android/.../gpu/Orientation.kt::mat2For exactly.
//
// No per-effect rotation/flip/V-flip compensation lives here. The transform is a
// SINGLE Metal render pass that samples the original directly, the same shape as
// the composite's single pass sampling uOriginal at plain vUv (which needs no V
// term); so an identity matrix is a true passthrough and the ops below add only
// their screen-space sign/swap. If a screenshot shows the WHOLE frame rotated
// the wrong way, that is an INGEST problem -> flip Ingest.ROTATION_DIRECTION, do
// not add a correction here.
//
// ----------------------------------------------------------------------------
// WHAT THE SHADER DOES
//   transform.metalsrc samples the input at:  uv = M * (vUv - 0.5) + 0.5
//   so M maps an OUTPUT uv (about the 0.5 center) back to an INPUT uv. This is
//   inverse mapping: for each output texel, where do I read the source. M is a
//   simd_float2x2 in COLUMN-vector convention: M * v = v.x*col0 + v.y*col1.
//   col0 is the image of (1,0); col1 is the image of (0,1).

import Foundation
import simd

enum Orientation {
  /// The four geometric reorientation ops, keyed by their registered effect
  /// name. Screen-space semantics are documented on each case.
  enum Op: String {
    /// Screen-horizontal mirror (left<->right, head stays up).
    case flipX = "flip-x"
    /// Screen-vertical flip (upside down, left/right unchanged).
    case flipY = "flip-y"
    /// Whole frame rotated 90 degrees clockwise (output dims swap to h x w).
    case rotateCW = "rotate-cw"
    /// Whole frame rotated 90 degrees counter-clockwise (output dims swap).
    case rotateCCW = "rotate-ccw"

    /// Whether this op swaps the output dimensions (w x h -> h x w). True for the
    /// 90-degree rotations, false for the flips.
    var swapsDimensions: Bool {
      switch self {
      case .flipX, .flipY: return false
      case .rotateCW, .rotateCCW: return true
      }
    }
  }

  /// The uUvTransform to bind at buffer(0) of transform.metalsrc for `op`. The
  /// input frame is already display-upright (see Ingest), so this is pure screen
  /// space and rotation-independent.
  ///
  /// flip-x:   negate U                       -> columns (-1, 0), ( 0,  1)
  /// flip-y:   negate V                       -> columns ( 1, 0), ( 0, -1)
  /// rotate-cw: a clockwise rotation of the IMAGE is a CCW rotation of the
  ///   sampling coordinates: output (u, v) reads input (v, 1-u) about center
  ///                                          -> columns ( 0,-1), ( 1,  0)
  /// rotate-ccw: the inverse                  -> columns ( 0, 1), (-1,  0)
  static func uvTransform(op: Op) -> simd_float2x2 {
    switch op {
    case .flipX:
      return simd_float2x2(columns: (SIMD2<Float>(-1, 0), SIMD2<Float>(0, 1)))
    case .flipY:
      return simd_float2x2(columns: (SIMD2<Float>(1, 0), SIMD2<Float>(0, -1)))
    case .rotateCW:
      // Device-confirmed swap: the derivation had the rotation sign backwards
      // (read as CCW on device vs the correct web reference).
      return simd_float2x2(columns: (SIMD2<Float>(0, 1), SIMD2<Float>(-1, 0)))
    case .rotateCCW:
      return simd_float2x2(columns: (SIMD2<Float>(0, -1), SIMD2<Float>(1, 0)))
    }
  }
}
