// Orientation: maps a screen-space reorientation op to a column-major 2x2 (the
// `uUvTransform` mat2 transform.frag multiplies into UV about the 0.5 center).
// All four transform ops (flip-x, flip-y, rotate-cw, rotate-ccw) call mat2For;
// none re-derive anything.
//
// ===== Pure screen space (read before "fixing") =====
//
// Camera orientation is normalized ONCE upstream, in Ingest: the OES->2D
// passthrough folds the display rotation into the texture matrix, so by the
// time TRANSFORM_FRAG samples the "original 2D" FBO it is already
// DISPLAY-UPRIGHT. The op matrices are therefore pure SCREEN SPACE and do NOT
// depend on frame.rotation:
//   flip-x (screen-horizontal mirror, head stays up) -> negate U
//   flip-y (screen-vertical flip, upside down)        -> negate V
//   rotate-cw / rotate-ccw                            -> swap axes (+ a sign)
//
// There is no per-effect rotation/flip compensation anywhere; if a screenshot
// shows the WHOLE frame rotated wrong, that is an ingest problem — flip
// Ingest.ROTATION_DIRECTION, do not add a correction here.
//
// mat2 column-major convention: floatArrayOf(a, b, c, d) builds the GLSL mat2
// whose columns are (a,b) and (c,d), i.e. M * v = (a*v.x + c*v.y, b*v.x +
// d*v.y). UV is taken about 0.5, so a sign flip on a column negates that output
// axis; swapping the columns' nonzero entries transposes (rotates) the axes.

package com.simiancraft.kaleidoscope.gpu

// Public (not internal) because TransformFactory is a public registered factory
// and takes an Op in its constructor; an internal Op would leak through a public
// signature.
object Orientation {
    /** Screen-space reorientation operations the transform effect exposes. */
    enum class Op { FLIP_X, FLIP_Y, ROTATE_CW, ROTATE_CCW }

    /** Does the op swap output dimensions (w x h -> h x w)? True for rotations. */
    fun swapsDimensions(op: Op): Boolean = op == Op.ROTATE_CW || op == Op.ROTATE_CCW

    /**
     * Column-major 2x2 for glUniformMatrix2fv. The input frame is already
     * display-upright (see Ingest), so this is rotation-independent.
     *
     * flip-x: negate U -> column 0 = (-1, 0), column 1 = (0, 1).
     * flip-y: negate V -> column 0 = ( 1, 0), column 1 = (0, -1).
     * rotate-cw / rotate-ccw: screen 90-degree rotations. Device-confirmed on the
     *   clean sampled space (both flips correct on both platforms, so the matrix->
     *   screen map is axis-aligned and orientation-preserving): columns (0,-1),(1,0)
     *   rendered COUNTER-clockwise, so clockwise is the inverse, columns (0,1),(-1,0).
     */
    fun mat2For(op: Op): FloatArray =
        when (op) {
            Op.FLIP_X -> floatArrayOf(-1f, 0f, 0f, 1f)
            Op.FLIP_Y -> floatArrayOf(1f, 0f, 0f, -1f)
            // Device-confirmed: columns (0,-1),(1,0) rendered CCW on the clean space,
            // so clockwise is its inverse, columns (0,1),(-1,0).
            Op.ROTATE_CW -> floatArrayOf(0f, 1f, -1f, 0f)
            Op.ROTATE_CCW -> floatArrayOf(0f, -1f, 1f, 0f)
        }
}
