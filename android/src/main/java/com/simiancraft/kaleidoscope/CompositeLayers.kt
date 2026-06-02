// Composite-layer spec side-channel for the native composite compositor.
//
// The Expo Module's setCompositeLayers(json) JS function writes here; the
// CompositeFactory reads the current layer stack each frame and composites it.
// This delivers the spec without re-registering: it carries the whole ordered
// layer stack (the composite is one registered effect name, "composite", whose
// contents JS swaps as the active composite changes).
//
// The wire shape is a JSON array of layer objects (see parse()). JS sends it as a
// String across the Expo bridge; we parse it once at set() time into immutable
// Kotlin models the GL thread can read without locking. @Volatile on the parsed
// reference is the memory barrier; the JS-thread write publishes, the GL-thread
// read observes the latest stable snapshot.
//
// A malformed layer is skipped with a log rather than crashing the render thread;
// an unparseable whole payload leaves the previous composite in place.

package com.simiancraft.kaleidoscope

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/** One parsed composite layer. The `shader` discriminant decides which fields matter. */
internal data class CompositeLayer(
  val id: String, // unique within a composite; the live-tuning / patch address
  val shader: String,
  val target: String, // "background" | "subject"
  val blend: String?, // "normal" | "additive" | null (base = opaque)
  val source: String?, // image id for an `image` layer; null otherwise
  val uniforms: Map<String, FloatArray>, // generative-layer uniforms, by name
)

internal object CompositeLayers {
  private const val TAG = "Kaleidoscope.CompositeLayers"

  @Volatile
  private var layers: List<CompositeLayer> = emptyList()

  /** The current parsed layer stack; a stable snapshot safe to read on the GL thread. */
  fun get(): List<CompositeLayer> = layers

  /**
   * Parse and store the composite layer stack from the JS-supplied JSON string.
   * Called on the Expo module thread (JS-driven), not the GL thread. Leaves the
   * previous composite in place on a whole-payload parse failure.
   */
  fun set(json: String) {
    val parsed = try {
      parse(json)
    } catch (t: Throwable) {
      Log.e(TAG, "failed to parse composite layers; keeping previous composite", t)
      return
    }
    layers = parsed
    Log.i(TAG, "composite layers set: ${parsed.size} layer(s) [${parsed.joinToString(",") { it.shader }}]")
  }

  /** Clear the active composite (used when a non-composite effect takes over). */
  fun clear() {
    layers = emptyList()
  }

  private fun parse(json: String): List<CompositeLayer> {
    val arr = JSONArray(json)
    val out = ArrayList<CompositeLayer>(arr.length())
    for (i in 0 until arr.length()) {
      val obj = arr.optJSONObject(i) ?: continue
      val shader = obj.optString("shader", "")
      if (shader.isEmpty()) {
        Log.w(TAG, "layer $i has no shader; skipping")
        continue
      }
      // `id` is always present on the wire now (serializeCompositeLayers emits it);
      // fall back to the array index so a malformed payload missing it still
      // yields a stable, unique-per-stack address rather than a collision.
      val id = if (obj.has("id") && !obj.isNull("id")) obj.getString("id") else i.toString()
      val target = obj.optString("target", "background")
      val blend = if (obj.has("blend") && !obj.isNull("blend")) obj.getString("blend") else null
      val source = if (obj.has("source") && !obj.isNull("source")) obj.getString("source") else null
      val uniforms = parseUniforms(obj.optJSONObject("uniforms"))
      out.add(CompositeLayer(id, shader, target, blend, source, uniforms))
    }
    return out
  }

  // name -> FloatArray. A JSON number -> [f]; a JSON array of numbers -> FloatArray.
  // A non-numeric or malformed value is skipped with a log (the shader keeps its
  // GLSL default for that name).
  private fun parseUniforms(obj: JSONObject?): Map<String, FloatArray> {
    if (obj == null) return emptyMap()
    val out = HashMap<String, FloatArray>(obj.length())
    val keys = obj.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val value = obj.opt(key)
      val floats = normalize(value)
      if (floats == null) {
        Log.w(TAG, "skipping uniform '$key': unsupported type ${value?.javaClass?.simpleName}")
        continue
      }
      out[key] = floats
    }
    return out
  }

  private fun normalize(value: Any?): FloatArray? =
    when (value) {
      is Number -> floatArrayOf(value.toFloat())
      is JSONArray -> {
        val out = FloatArray(value.length())
        var ok = true
        for (i in 0 until value.length()) {
          val n = value.opt(i)
          if (n is Number) out[i] = n.toFloat() else { ok = false; break }
        }
        if (ok) out else null
      }
      else -> null
    }
}
