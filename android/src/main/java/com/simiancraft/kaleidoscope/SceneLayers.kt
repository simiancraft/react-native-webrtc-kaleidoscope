// Scene-layer spec side-channel for the native scene compositor.
//
// The Expo Module's setSceneLayers(json) JS function writes here; the SceneFactory
// reads the current layer stack each frame and composites it. This mirrors
// ShaderUniforms' "deliver spec without re-registering" pattern, but carries the
// whole ordered layer stack (the scene is one registered effect name, "scene",
// whose contents JS swaps as the active scene changes).
//
// The wire shape is a JSON array of layer objects (see parse()). JS sends it as a
// String across the Expo bridge; we parse it once at set() time into immutable
// Kotlin models the GL thread can read without locking. @Volatile on the parsed
// reference is the memory barrier; the JS-thread write publishes, the GL-thread
// read observes the latest stable snapshot.
//
// A malformed layer is skipped with a log rather than crashing the render thread;
// an unparseable whole payload leaves the previous scene in place.

package com.simiancraft.kaleidoscope

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/** One parsed scene layer. The `shader` discriminant decides which fields matter. */
internal data class SceneLayer(
  val id: String, // unique within a composite; the live-tuning / patch address
  val shader: String,
  val target: String, // "background" | "subject"
  val blend: String?, // "normal" | "additive" | null (base = opaque)
  val source: String?, // plate id for an `image` layer; null otherwise
  val uniforms: Map<String, FloatArray>, // generative-layer uniforms, by name
)

internal object SceneLayers {
  private const val TAG = "Kaleidoscope.SceneLayers"

  @Volatile
  private var layers: List<SceneLayer> = emptyList()

  /** The current parsed layer stack; a stable snapshot safe to read on the GL thread. */
  fun get(): List<SceneLayer> = layers

  /**
   * Parse and store the scene layer stack from the JS-supplied JSON string.
   * Called on the Expo module thread (JS-driven), not the GL thread. Leaves the
   * previous scene in place on a whole-payload parse failure.
   */
  fun set(json: String) {
    val parsed = try {
      parse(json)
    } catch (t: Throwable) {
      Log.e(TAG, "failed to parse scene layers; keeping previous scene", t)
      return
    }
    layers = parsed
    Log.i(TAG, "scene layers set: ${parsed.size} layer(s) [${parsed.joinToString(",") { it.shader }}]")
  }

  /** Clear the active scene (used when a non-scene effect takes over). */
  fun clear() {
    layers = emptyList()
  }

  private fun parse(json: String): List<SceneLayer> {
    val arr = JSONArray(json)
    val out = ArrayList<SceneLayer>(arr.length())
    for (i in 0 until arr.length()) {
      val obj = arr.optJSONObject(i) ?: continue
      val shader = obj.optString("shader", "")
      if (shader.isEmpty()) {
        Log.w(TAG, "layer $i has no shader; skipping")
        continue
      }
      // `id` is always present on the wire now (serializeSceneLayers emits it);
      // fall back to the array index so a malformed payload missing it still
      // yields a stable, unique-per-stack address rather than a collision.
      val id = if (obj.has("id") && !obj.isNull("id")) obj.getString("id") else i.toString()
      val target = obj.optString("target", "background")
      val blend = if (obj.has("blend") && !obj.isNull("blend")) obj.getString("blend") else null
      val source = if (obj.has("source") && !obj.isNull("source")) obj.getString("source") else null
      val uniforms = parseUniforms(obj.optJSONObject("uniforms"))
      out.add(SceneLayer(id, shader, target, blend, source, uniforms))
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
