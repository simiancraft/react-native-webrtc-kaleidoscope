// Generic per-shader uniform side-channel for the generative shader processor.
//
// The Expo Module's setShaderUniforms(name, uniforms) JS function writes here;
// the generic ShaderFactory reads its shader's uniforms each frame and binds
// them by name. This mirrors EffectTuning's "tune without re-registering"
// pattern, but keyed per shader name so multiple generative shaders coexist.
//
// Shape: name -> (uniformName -> FloatArray). Each JS value normalizes once at
// write time:
//   - a JS number arrives across the Expo bridge as a Double -> floatArrayOf(it)
//   - a JS array arrives as a List<*> of Double -> FloatArray of the same length
// Anything else (a String, a nested map, a null element) is skipped with a log
// so a malformed uniform never crashes the render thread; the shader just keeps
// the previous value (or the GLSL default) for that name.
//
// The store snapshots the whole inner map on each set() (copy-on-write), so the
// GL thread's get() returns an immutable view it can iterate without locking
// against a concurrent write. @Volatile on the outer reference is the memory
// barrier; the synchronized block serializes writers.

package com.simiancraft.kaleidoscope

import android.util.Log

internal object ShaderUniforms {
  private const val TAG = "Kaleidoscope.Uniforms"

  // name -> (uniformName -> values). Replaced wholesale on each set() so the
  // GL thread reads a stable snapshot. @Volatile publishes the new reference.
  @Volatile
  private var store: Map<String, Map<String, FloatArray>> = emptyMap()

  private val writeLock = Any()

  /**
   * Store the uniforms for [name], normalizing each JS value to a FloatArray.
   * Called on the Expo module thread (JS-driven), not the GL thread.
   */
  fun set(name: String, uniforms: Map<String, Any?>) {
    val normalized = HashMap<String, FloatArray>(uniforms.size)
    for ((key, value) in uniforms) {
      val floats = normalize(value)
      if (floats == null) {
        Log.w(TAG, "skipping uniform '$key' for shader '$name': unsupported type ${value?.javaClass?.simpleName}")
        continue
      }
      normalized[key] = floats
    }
    synchronized(writeLock) {
      // Copy-on-write: build a new outer map so the GL thread's snapshot of the
      // previous map stays immutable while this write publishes.
      val next = HashMap(store)
      next[name] = normalized
      store = next
    }
  }

  /**
   * The current uniforms for [name], or null if none have been set. The
   * returned map is a stable snapshot; safe to iterate on the GL thread.
   */
  fun get(name: String): Map<String, FloatArray>? = store[name]

  private fun normalize(value: Any?): FloatArray? =
    when (value) {
      // JS number -> Double across the Expo bridge. Also accept the other
      // numeric boxings defensively.
      is Double -> floatArrayOf(value.toFloat())
      is Float -> floatArrayOf(value)
      is Int -> floatArrayOf(value.toFloat())
      is Long -> floatArrayOf(value.toFloat())
      // JS array -> List<*> of Double. Each element must be a Number; a single
      // non-numeric element invalidates the whole uniform (return null) rather
      // than silently zero-filling it.
      is List<*> -> {
        val out = FloatArray(value.size)
        var ok = true
        for (i in value.indices) {
          val n = value[i]
          if (n is Number) {
            out[i] = n.toFloat()
          } else {
            ok = false
            break
          }
        }
        if (ok) out else null
      }
      else -> null
    }
}
