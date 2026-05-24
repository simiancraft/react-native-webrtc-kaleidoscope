// Orientation: the ONE place that maps a screen-space reorientation op plus the
// camera frame's rotation to a column-major 2x2 (the `uUvTransform` mat2 the
// transform.frag shader multiplies into UV about the 0.5 center). All four
// transform ops (flip-x, flip-y, rotate-cw, rotate-ccw) call mat2For; none
// re-derive the rotation logic. A future background cover-fit change reuses it.
//
// ===== The orientation assumption (load-bearing; read before "fixing") =====
//
// The transform effect runs a single TRANSFORM_FRAG pass over the "original 2D"
// FBO produced by the OES->2D passthrough, and that passthrough applies the
// camera buffer's transformMatrix (uTexMatrix) exactly like BlurFactory and
// BackgroundImageFactory do. So by the time TRANSFORM_FRAG samples it, the
// intermediate is the DISPLAY-ORIENTED frame (sensor rotation + selfie mirror +
// crop already baked in), NOT the raw landscape sensor buffer.
//
// That is the key difference from the old I420 mirror (commit 8978304). The
// I420 path operated on toI420() output, which is the RAW landscape buffer with
// NO transform applied; that is why it had to flip buffer-Y on portrait to read
// as a screen-horizontal mirror. Because our GL pass sees a display-oriented
// frame instead, the op matrices are pure SCREEN-SPACE and DO NOT depend on
// frame.rotation:
//   flip-x (screen-horizontal mirror, head stays up) -> negate U
//   flip-y (screen-vertical flip, upside down)        -> negate V
//   rotate-cw / rotate-ccw                            -> swap axes (+ a sign)
//
// This mirrors the iOS BlurProcessor comment: "Android's GL pipeline carries the
// camera orientation and is correct without [a V-flip]." The transformMatrix is
// what carries it.
//
// IF a device screenshot shows the transform pass actually seeing a
// raw-landscape frame (e.g. some camera stack hands us an OES texture whose
// transformMatrix is identity), flip the single switch below to
// `BUFFER_SPACE` and the helper conjugates the screen-space op by the frame
// rotation (T_buffer = Rot(-R) . T_screen . Rot(R)); that path reproduces the
// I420 mirror's proven portrait behavior (buffer-Y flip = screen-horizontal).
// The correction is one line; do not scatter rotation logic into the ops.
//
// mat2 column-major convention: floatArrayOf(a, b, c, d) uploaded via
// glUniformMatrix2fv builds the GLSL mat2 whose columns are (a,b) and (c,d),
// i.e. M * v = (a*v.x + c*v.y, b*v.x + d*v.y). UV is taken about 0.5, so a sign
// flip on a column negates that output axis; swapping the columns' nonzero
// entries transposes (rotates) the axes.

package com.simiancraft.kaleidoscope.gpu

// Public (not internal) because TransformFactory is a public registered factory
// and takes an Op in its constructor; an internal Op would leak through a public
// signature. The implementation members below stay private.
object Orientation {
  /** Screen-space reorientation operations the transform effect exposes. */
  enum class Op { FLIP_X, FLIP_Y, ROTATE_CW, ROTATE_CCW }

  /**
   * Which space the TRANSFORM_FRAG pass samples in. BUFFER is correct here
   * (device-confirmed); the GL pass sees the raw landscape buffer, so the op is
   * conjugated by the frame rotation. SCREEN remains as the fallback if a camera
   * stack ever hands us an already-display-oriented intermediate.
   */
  private enum class Space { SCREEN, BUFFER }

  // Device-confirmed 2026-05-24: SCREEN was wrong — flip-x/flip-y came out
  // swapped and rotate-cw/ccw reversed, the signature of the GL pass sampling
  // the RAW LANDSCAPE buffer (the OES transformMatrix does not fully pre-orient
  // it here). BUFFER conjugates by frame rotation and reads correct on a
  // portrait device.
  private val SAMPLE_SPACE = Space.BUFFER

  /** Does the op swap output dimensions (w x h -> h x w)? True for rotations. */
  fun swapsDimensions(op: Op): Boolean = op == Op.ROTATE_CW || op == Op.ROTATE_CCW

  /**
   * Column-major 2x2 for glUniformMatrix2fv. `frameRotation` is the
   * VideoFrame.rotation in degrees (0, 90, 180, 270); it is ignored in SCREEN
   * space and used to conjugate the op in BUFFER space.
   */
  fun mat2For(op: Op, frameRotation: Int): FloatArray =
    when (SAMPLE_SPACE) {
      Space.SCREEN -> screenSpaceMat2(op)
      Space.BUFFER -> bufferSpaceMat2(op, normalizeRotation(frameRotation))
    }

  // ----- SCREEN space: rotation-independent; the displayed frame is already
  // upright before TRANSFORM_FRAG runs. -----
  //
  // flip-x: negate U -> column 0 = (-1, 0), column 1 = (0, 1).
  // flip-y: negate V -> column 0 = ( 1, 0), column 1 = (0, -1).
  // rotate-cw: a clockwise rotation of the IMAGE is a counter-clockwise
  //   rotation of the sampling coordinates. Output pixel (u, v) reads input
  //   (v, 1-u) about center -> mat2 columns (0, -1) and (1, 0).
  // rotate-ccw: the inverse -> columns (0, 1) and (-1, 0).
  private fun screenSpaceMat2(op: Op): FloatArray =
    when (op) {
      Op.FLIP_X -> floatArrayOf(-1f, 0f, 0f, 1f)
      Op.FLIP_Y -> floatArrayOf(1f, 0f, 0f, -1f)
      Op.ROTATE_CW -> floatArrayOf(0f, -1f, 1f, 0f)
      Op.ROTATE_CCW -> floatArrayOf(0f, 1f, -1f, 0f)
    }

  // ----- BUFFER space: T_buffer = Rot(-R) . T_screen . Rot(R). Kept as an
  // explicit per-R switch (not a runtime matrix multiply) so the must-match
  // portrait values are inspectable and a screenshot fix is one literal edit.
  // The portrait (R in {90, 270}) values reproduce the I420 mirror proof:
  // flip-x negates V (buffer-Y), flip-y negates U; rotations are unchanged. -----
  private fun bufferSpaceMat2(op: Op, rotation: Int): FloatArray {
    val portrait = rotation == 90 || rotation == 270
    return when (op) {
      // flip-x: portrait -> negate V; landscape -> negate U.
      Op.FLIP_X ->
        if (portrait) floatArrayOf(1f, 0f, 0f, -1f) else floatArrayOf(-1f, 0f, 0f, 1f)
      // flip-y: portrait -> negate U; landscape -> negate V.
      Op.FLIP_Y ->
        if (portrait) floatArrayOf(-1f, 0f, 0f, 1f) else floatArrayOf(1f, 0f, 0f, -1f)
      // rotations are rotation-invariant under the conjugation.
      Op.ROTATE_CW -> floatArrayOf(0f, 1f, -1f, 0f)
      Op.ROTATE_CCW -> floatArrayOf(0f, -1f, 1f, 0f)
    }
  }

  private fun normalizeRotation(deg: Int): Int = ((deg % 360) + 360) % 360
}
