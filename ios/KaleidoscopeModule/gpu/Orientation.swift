// The SINGLE place the camera-buffer reorientation math lives for iOS.
//
// All four geometric ops (flip-x, flip-y, rotate-cw, rotate-ccw) share one
// shader (transform.metalsrc) and compute their uUvTransform here; none of the
// processors re-derive the rotation logic. A future background "cover-fit" pass
// that needs the same screen<->buffer mapping reuses uvTransform(...) too.
//
// ----------------------------------------------------------------------------
// WHAT THE SHADER DOES
//   transform.metalsrc samples the input at:  uv = M * (vUv - 0.5) + 0.5
//   so M maps an OUTPUT uv (about the 0.5 center) back to an INPUT uv. This is
//   inverse mapping: for each output texel, where do I read the source. M is a
//   simd_float2x2 in COLUMN-vector convention: M * v = v.x*col0 + v.y*col1.
//   col0 is the image of (1,0); col1 is the image of (0,1).
//
// SCREEN vs BUFFER SPACE
//   The op is specified in SCREEN space (what the human sees) and must match the
//   already-verified web behavior:
//     flip-x  = screen-horizontal mirror (left<->right, head stays up)
//     flip-y  = screen-vertical flip (upside down, left/right unchanged)
//     rotate-cw / rotate-ccw = whole frame rotated 90 degrees; the host
//       allocates an (h x w) output to match the swapped dims.
//   The shader runs in camera BUFFER space, and the display rotates the buffer
//   by frameRotation R. Screen->buffer is a conjugation:
//       T_buffer = Rot(-R) . T_screen . Rot(R)
//   For portrait R in {90, 270} the buffer's X axis maps to the screen's
//   vertical, so a screen flip swaps which buffer axis is negated; 90-degree
//   rotations are unchanged by the conjugation. For landscape R in {0, 180} the
//   axes already align, so the screen op applies directly to the buffer.
//
// ----------------------------------------------------------------------------
// FIRST-CUT MATRICES (calibrated later via device screenshots)
//   These are the intent matrices BEFORE the iOS V-flip compensation below.
//
//   Portrait, R in {90, 270} (the only case tested at first cut):
//     flip-x      -> negate V  -> columns (1,0), (0,-1)
//     flip-y      -> negate U  -> columns (-1,0), (0,1)
//     rotate-cw   -> columns (0,-1), (1,0)
//     rotate-ccw  -> columns (0,1), (-1,0)
//
//   Landscape, R in {0, 180}:
//     flip-x      -> negate U  -> columns (-1,0), (0,1)
//     flip-y      -> negate V  -> columns (1,0), (0,-1)
//     rotate-cw   -> columns (0,-1), (1,0)
//     rotate-ccw  -> columns (0,1), (-1,0)
//
//   These are the ONE-LINE-fixable switch. If a device screenshot shows a given
//   op is wrong, edit only its `intent` matrix in `Op.intentMatrix(rotation:)`.
//
// ----------------------------------------------------------------------------
// CRITICAL iOS-SPECIFIC V-FLIP COMPENSATION (documented; see MetalRenderer header
// and the BlurProcessor composite bgUvScale=(1,-1) comment)
//   EVERY Metal render-to-texture pass in this module flips vertically in buffer
//   space, because the transpiled spirv-cross passthrough vertex does NOT negate
//   gl_Position.y (shaders/passthrough.vert documents the GL convention; the
//   transpile drops the negation). The transform is one such render pass, so its
//   OUTPUT is V-flipped relative to the intent matrix above.
//
//   We cancel it by composing a vertical flip on the SAMPLED (incoming) UV, i.e.
//   negate the V component the shader feeds into M. In centered-UV space that is
//   the matrix factor:
//       Fv = | 1   0 |   (negate the incoming V before the intent transform)
//            | 0  -1 |
//   and the bound matrix is:
//       M = intent * Fv
//   Right-multiplying by Fv negates the SECOND COLUMN of `intent` (col1 = the
//   image of the V basis), which is exactly "flip the sign of the V row of the
//   uv-transform" expressed in this column-vector convention. This is the iOS
//   term the screenshot calibration confirms or adjusts.
//
//   *** TO INVERT THE COMPENSATION (if a screenshot shows the result upside
//       down): change `applyIosVFlipCompensation` to false. That is the single
//       sign switch; nothing else moves. ***

import Foundation
import simd

enum Orientation {
  /// The four geometric reorientation ops, keyed by their registered effect
  /// name. Screen-space semantics are documented on each case.
  enum Op: String {
    /// Screen-horizontal mirror (left<->right, head stays up). The corrected
    /// successor to the removed "mirror" effect.
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

    /// First-cut INTENT matrix (before the iOS V-flip compensation), as a
    /// function of the frame rotation. THIS is the one-line-fixable switch:
    /// each case returns its columns from the tables in the file header.
    fileprivate func intentMatrix(rotation: Int) -> simd_float2x2 {
      // Normalize to {0, 90, 180, 270}; treat anything unexpected as 0.
      let r = ((rotation % 360) + 360) % 360
      let isPortrait = (r == 90 || r == 270)
      switch self {
      case .flipX:
        // Portrait: negate V. Landscape: negate U.
        return isPortrait
          ? simd_float2x2(columns: (SIMD2<Float>(1, 0), SIMD2<Float>(0, -1)))
          : simd_float2x2(columns: (SIMD2<Float>(-1, 0), SIMD2<Float>(0, 1)))
      case .flipY:
        // Portrait: negate U. Landscape: negate V.
        return isPortrait
          ? simd_float2x2(columns: (SIMD2<Float>(-1, 0), SIMD2<Float>(0, 1)))
          : simd_float2x2(columns: (SIMD2<Float>(1, 0), SIMD2<Float>(0, -1)))
      case .rotateCW:
        // Rotation is unchanged by the portrait/landscape conjugation.
        return simd_float2x2(columns: (SIMD2<Float>(0, -1), SIMD2<Float>(1, 0)))
      case .rotateCCW:
        return simd_float2x2(columns: (SIMD2<Float>(0, 1), SIMD2<Float>(-1, 0)))
      }
    }
  }

  /// The iOS-specific V-flip compensation toggle. Flip to `false` if a device
  /// screenshot shows the transform output is vertically inverted. This is the
  /// single sign switch the file header refers to.
  private static let applyIosVFlipCompensation = true

  /// Negate the incoming V before the intent transform: M = intent * Fv.
  /// Right-multiplying by Fv negates intent's second column.
  private static let iosVFlip = simd_float2x2(
    columns: (SIMD2<Float>(1, 0), SIMD2<Float>(0, -1))
  )

  /// The uUvTransform to bind at buffer(0) of transform.metalsrc for `op` at the
  /// given `frameRotation` (RTCVideoFrame.rotation.rawValue: 0/90/180/270).
  static func uvTransform(op: Op, frameRotation: Int) -> simd_float2x2 {
    let intent = op.intentMatrix(rotation: frameRotation)
    return applyIosVFlipCompensation ? intent * iosVFlip : intent
  }
}
