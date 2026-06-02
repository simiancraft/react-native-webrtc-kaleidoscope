// Composite-layer spec side-channel for the iOS composite compositor. Direct port of
// android/.../CompositeLayers.kt.
//
// The Expo Module's setCompositeLayers(json) JS function writes here; CompositeProcessor
// reads the current layer stack each frame and composites it. This mirrors
// ShaderUniforms' "deliver spec without re-registering" pattern, but carries the
// whole ordered layer stack (the compositor is one registered effect name,
// "composite", whose contents JS swaps as the active composite changes).
//
// The wire shape is a JSON array of layer objects (see parse()). JS sends it as a
// String across the Expo bridge; we parse it once at set() time into immutable
// value-type models the capture thread can read under a cheap lock. set() runs
// on the JS/Expo thread; get() on the capture thread. An os_unfair_lock around
// the snapshot reference is the memory barrier (the Swift analogue of Android's
// @Volatile + immutable List), matching ShaderUniforms / EffectTuning on iOS.
//
// A malformed layer is skipped with a log rather than crashing the render thread;
// an unparseable whole payload leaves the previous composite in place.

import Foundation
import os.log

/// One parsed composite layer. The `shader` discriminant decides which fields matter.
/// A value type, so a `CompositeLayers.get()` snapshot the capture thread reads is an
/// immutable copy that a concurrent set() cannot mutate underneath it.
struct CompositeLayer {
  let id: String // unique within a composite; the live-tuning / patch address
  let shader: String
  let target: String // "background" | "subject"
  let blend: String? // "normal" | "additive" | nil (base = opaque)
  let source: String? // plate id for an `image` layer; nil otherwise
  let uniforms: [String: [Float]] // generative-layer uniforms, by name
}

enum CompositeLayers {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "CompositeLayers")

  private static var unsafeLock = os_unfair_lock_s()
  private static var layers: [CompositeLayer] = []

  /// The current parsed layer stack; a stable snapshot safe to read on the
  /// capture thread. Returns a value-type array copy.
  static func get() -> [CompositeLayer] {
    os_unfair_lock_lock(&unsafeLock)
    defer { os_unfair_lock_unlock(&unsafeLock) }
    return layers
  }

  /// Parse and store the composite layer stack from the JS-supplied JSON string.
  /// Called on the Expo module thread (JS-driven), not the capture thread.
  /// Leaves the previous composite in place on a whole-payload parse failure.
  static func set(_ json: String) {
    guard let parsed = parse(json) else {
      os_log("failed to parse composite layers; keeping previous composite",
             log: log, type: .error)
      return
    }
    os_unfair_lock_lock(&unsafeLock)
    layers = parsed
    os_unfair_lock_unlock(&unsafeLock)
    os_log("composite layers set: %d layer(s) [%{public}@]",
           log: log, type: .info,
           parsed.count, parsed.map { $0.shader }.joined(separator: ","))
  }

  /// Clear the active composite (used when a non-composite effect takes over).
  static func clear() {
    os_unfair_lock_lock(&unsafeLock)
    layers = []
    os_unfair_lock_unlock(&unsafeLock)
  }

  // Parse the JSON array into value-type models. Returns nil on a whole-payload
  // failure (not an array, not valid JSON); a single malformed layer is skipped
  // with a log, mirroring CompositeLayers.kt.
  private static func parse(_ json: String) -> [CompositeLayer]? {
    guard let data = json.data(using: .utf8) else { return nil }
    let root: Any
    do {
      root = try JSONSerialization.jsonObject(with: data)
    } catch {
      return nil
    }
    guard let array = root as? [Any] else { return nil }
    var out = [CompositeLayer]()
    out.reserveCapacity(array.count)
    for (index, element) in array.enumerated() {
      guard let obj = element as? [String: Any] else { continue }
      guard let shader = obj["shader"] as? String, !shader.isEmpty else {
        os_log("layer %d has no shader; skipping", log: log, type: .info, index)
        continue
      }
      // `id` is always present on the wire now (serializeCompositeLayers emits it);
      // fall back to the array index so a malformed payload missing it still
      // yields a stable, unique-per-stack address rather than a collision.
      // Mirrors CompositeLayers.kt's id fallback.
      let id = (obj["id"] as? String) ?? String(index)
      let target = (obj["target"] as? String) ?? "background"
      let blend = obj["blend"] as? String
      let source = obj["source"] as? String
      let uniforms = parseUniforms(obj["uniforms"])
      out.append(CompositeLayer(id: id, shader: shader, target: target, blend: blend,
                            source: source, uniforms: uniforms))
    }
    return out
  }

  // name -> [Float]. A JSON number -> [f]; a JSON array of numbers -> [Float].
  // A non-numeric or malformed value is skipped with a log (the shader keeps its
  // MSL default for that name). NSNumber covers JSON's number type across the
  // Foundation deserializer; bool-typed NSNumbers are accepted as 0/1 (harmless
  // for a uniform channel). Mirrors CompositeLayers.parseUniforms.
  private static func parseUniforms(_ value: Any?) -> [String: [Float]] {
    guard let obj = value as? [String: Any] else { return [:] }
    var out = [String: [Float]]()
    out.reserveCapacity(obj.count)
    for (key, raw) in obj {
      if let floats = normalize(raw) {
        out[key] = floats
      } else {
        os_log("skipping uniform %{public}@: unsupported type", log: log, type: .info, key)
      }
    }
    return out
  }

  private static func normalize(_ value: Any) -> [Float]? {
    if let number = value as? NSNumber {
      return [number.floatValue]
    }
    if let array = value as? [Any] {
      var out = [Float]()
      out.reserveCapacity(array.count)
      for element in array {
        guard let number = element as? NSNumber else { return nil }
        out.append(number.floatValue)
      }
      return out
    }
    return nil
  }
}
