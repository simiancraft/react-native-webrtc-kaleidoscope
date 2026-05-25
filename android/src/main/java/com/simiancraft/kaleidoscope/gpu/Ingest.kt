// Ingest: the ONE place camera orientation is normalized.
//
// ===== Why this exists (read before "fixing" any effect's orientation) =====
//
// The camera hands us an OES external texture plus a 3x3 `transformMatrix`. That
// matrix bakes in sensor-correction, the selfie mirror, and crop, but it does
// NOT apply the display rotation: on a portrait phone the OES->2D passthrough,
// fed only `transformMatrix`, still lands a RAW LANDSCAPE frame in the FBO
// (device-confirmed 2026-05-24). Every effect then had to re-correct that
// rotation itself (transform ops conjugated in buffer space, the background
// composited pre-rotated). That per-effect cascade is what this module removes.
//
// `composedTexMatrix` folds the display rotation INTO the texture matrix, so the
// single OES->2D pass that BlurFactory, BackgroundImageFactory, and
// TransformFactory each run now lands a DISPLAY-UPRIGHT frame in the FBO. The
// FBO is sized with `displayWidth` / `displayHeight` (buffer dims swapped on a
// 90/270 frame), so the upright image fills it without clamping.
//
// After ingest the "original 2D" FBO is canonical: every downstream pass
// (transform mat2, background cover-fit, blur, the mask downsample/MediaPipe) reads
// an already-upright square [0,1] UV space and applies NO further orientation
// correction. Each factory therefore returns the frame with rotation 0; the
// pixels are already where the encoder/renderer expects an upright frame.
//
// ===== The composition =====
//
// The OES frag samples `uv = (uTexMatrix * vec4(vUv, 0, 1)).xy`, where `vUv`
// runs [0,1] across the destination (now display-upright) quad. We compose
//   M' = transformMatrix * Rot(theta about 0.5)
// so a destination display-UV is first rotated back into the pre-rotation space
// `transformMatrix` was authored against, then mapped to buffer UV. theta is
// `frame.rotation` scaled by ROTATION_DIRECTION.
//
// ===== Calibration (device verifies; may need one literal edit) =====
//
// ROTATION_DIRECTION below is the single sign that decides whether the display
// rotation is applied as +R or -R. If the person/background comes out rotated
// the wrong way (e.g. 90 off, or upside down on a 180 device), flip this sign.
// Nothing else in the orientation story should ever need touching.

package com.simiancraft.kaleidoscope.gpu

internal object Ingest {
  // The ONE orientation calibration knob. +1f applies the display rotation as
  // -frame.rotation about center (the geometric inverse, which is what maps a
  // display-upright destination UV back into the camera's pre-rotation UV
  // space); -1f applies +frame.rotation. Flip this sign if a portrait-device
  // screenshot shows the whole frame rotated the wrong way. This is the only
  // place orientation direction is decided.
  private const val ROTATION_DIRECTION = 1f

  /** Display width for a buffer of [bufferWidth] x [bufferHeight] at [frameRotation]. */
  fun displayWidth(bufferWidth: Int, bufferHeight: Int, frameRotation: Int): Int =
    if (swaps(frameRotation)) bufferHeight else bufferWidth

  /** Display height for a buffer of [bufferWidth] x [bufferHeight] at [frameRotation]. */
  fun displayHeight(bufferWidth: Int, bufferHeight: Int, frameRotation: Int): Int =
    if (swaps(frameRotation)) bufferWidth else bufferHeight

  /** Does this frame rotation swap buffer dims into display dims? */
  private fun swaps(frameRotation: Int): Boolean {
    val r = normalize(frameRotation)
    return r == 90 || r == 270
  }

  /**
   * Column-major 4x4 for the OES->2D pass's `uTexMatrix`, composing the camera
   * [transformMatrix] with the display rotation derived from [frameRotation].
   * Feed the result straight to glUniformMatrix4fv (already flat, length 16).
   *
   * M' = transformMatrix4 * Rot(theta about 0.5), where
   * theta = ROTATION_DIRECTION * frameRotation degrees.
   */
  fun composedTexMatrix(
    transformMatrix: android.graphics.Matrix,
    frameRotation: Int,
  ): FloatArray {
    val base = Egl.matrixToGl(transformMatrix)
    val rot = rotationAboutCenter(ROTATION_DIRECTION * normalize(frameRotation).toFloat())
    return multiplyColumnMajor4(base, rot)
  }

  /**
   * Column-major 4x4 that rotates the xy UV plane by [degrees] about (0.5, 0.5),
   * leaving z and w untouched. Translate-to-center, rotate, translate-back.
   */
  private fun rotationAboutCenter(degrees: Float): FloatArray {
    val rad = Math.toRadians(degrees.toDouble())
    val c = Math.cos(rad).toFloat()
    val s = Math.sin(rad).toFloat()
    // 2D rotation about 0.5 in (x, y):
    //   x' = c*(x-0.5) - s*(y-0.5) + 0.5
    //   y' = s*(x-0.5) + c*(y-0.5) + 0.5
    // As an affine 4x4 (column-major): linear block in the upper-left 2x2,
    // translation in the last column.
    val tx = 0.5f - 0.5f * c + 0.5f * s
    val ty = 0.5f - 0.5f * s - 0.5f * c
    return floatArrayOf(
      c, s, 0f, 0f,
      -s, c, 0f, 0f,
      0f, 0f, 1f, 0f,
      tx, ty, 0f, 1f,
    )
  }

  /** a * b, both column-major 4x4 flat arrays (length 16). Returns a*b. */
  private fun multiplyColumnMajor4(a: FloatArray, b: FloatArray): FloatArray {
    val out = FloatArray(16)
    for (col in 0 until 4) {
      for (row in 0 until 4) {
        var sum = 0f
        for (k in 0 until 4) {
          // column-major index: element(row, k) = a[k*4 + row]
          sum += a[k * 4 + row] * b[col * 4 + k]
        }
        out[col * 4 + row] = sum
      }
    }
    return out
  }

  private fun normalize(deg: Int): Int = ((deg % 360) + 360) % 360
}
