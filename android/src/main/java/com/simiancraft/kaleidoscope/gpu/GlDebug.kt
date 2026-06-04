// Lightweight GL error inspector. Call after operations that can fail silently
// on the GPU; logs to adb logcat with a stage tag so a remote tester can read
// the failure without a debugger attached.
//
// Cost: one glGetError per call (~50ns). Place liberally on slow-iteration
// code paths (rare allocations, setup, error fallbacks); skip in hot inner
// loops only if profiling shows it matters.

package com.simiancraft.kaleidoscope.gpu

import android.opengl.GLES30
import android.util.Log

internal object GlDebug {
    private const val TAG = "Kaleidoscope.GL"

    /**
     * Drain any pending GL errors and log them tagged with `stage`. Returns
     * true if at least one error was found.
     */
    fun check(stage: String): Boolean {
        var found = false
        while (true) {
            val err = GLES30.glGetError()
            if (err == GLES30.GL_NO_ERROR) break
            Log.e(TAG, "[$stage] glGetError = 0x${err.toString(16)} (${errorName(err)})")
            found = true
        }
        return found
    }

    private fun errorName(err: Int): String =
        when (err) {
            GLES30.GL_INVALID_ENUM -> "GL_INVALID_ENUM"
            GLES30.GL_INVALID_VALUE -> "GL_INVALID_VALUE"
            GLES30.GL_INVALID_OPERATION -> "GL_INVALID_OPERATION"
            GLES30.GL_INVALID_FRAMEBUFFER_OPERATION -> "GL_INVALID_FRAMEBUFFER_OPERATION"
            GLES30.GL_OUT_OF_MEMORY -> "GL_OUT_OF_MEMORY"
            else -> "unknown"
        }
}
