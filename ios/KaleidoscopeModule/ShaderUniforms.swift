// Generic per-shader uniform side-channel for the generative shader processor.
// Mirrors android/.../ShaderUniforms.kt.
//
// The Expo Module's setShaderUniforms(name, uniforms) JS function writes here;
// the generic ShaderProcessor reads its shader's uniforms each frame and binds
// them by name. This mirrors EffectTuning's "tune without re-registering"
// pattern, but keyed per shader name so multiple generative shaders coexist.
//
// Shape: name -> (uniformName -> [Float]). Each JS value normalizes once at
// write time:
//   - a JS number arrives across the Expo bridge as a Double -> [Float] length 1
//   - a JS array arrives as [Double] (or [Any] of NSNumber) -> [Float] same length
// Anything else (a String, a nested map, a null element) is skipped with a log
// so a malformed uniform never crashes the render thread; the shader just keeps
// the previous value (or the GLSL default) for that name.
//
// THREADING (mirrors the Android @Volatile + synchronized COW pattern):
//   set() runs on the Expo module (JS-driven) thread; get() runs on the capture
//   thread per frame. The whole inner map is replaced wholesale on each set()
//   under a lock, so get() returns an immutable snapshot it can iterate without
//   holding the lock against a concurrent write. os_unfair_lock serializes both
//   the read of the outer reference and the writer; the dictionaries themselves
//   are value types (Swift Dictionary is COW), so the snapshot the reader holds
//   stays stable even if a writer publishes a new outer map.

import Foundation
import os.log

enum ShaderUniforms {
  private static let log = OSLog(subsystem: "com.simiancraft.kaleidoscope", category: "Uniforms")

  // name -> (uniformName -> values). Replaced wholesale on each set() so the
  // capture thread reads a stable snapshot.
  private static var store: [String: [String: [Float]]] = [:]
  private static var unsafeLock = os_unfair_lock_s()

  /// Store the uniforms for `name`, normalizing each JS value to a [Float].
  /// Called on the Expo module thread (JS-driven), not the capture thread.
  static func set(name: String, uniforms: [String: Any]) {
    var normalized = [String: [Float]](minimumCapacity: uniforms.count)
    for (key, value) in uniforms {
      guard let floats = normalize(value) else {
        os_log("skipping uniform %{public}@ for shader %{public}@: unsupported type",
               log: log, type: .info, key, name)
        continue
      }
      normalized[key] = floats
    }
    os_unfair_lock_lock(&unsafeLock)
    store[name] = normalized
    os_unfair_lock_unlock(&unsafeLock)
  }

  /// The current uniforms for `name`, or nil if none have been set. The returned
  /// dictionary is a value-type snapshot; safe to iterate on the capture thread.
  static func get(_ name: String) -> [String: [Float]]? {
    os_unfair_lock_lock(&unsafeLock)
    defer { os_unfair_lock_unlock(&unsafeLock) }
    return store[name]
  }

  /// Normalize a single JS-bridged value to a [Float], or nil if unsupported.
  /// Across the Expo bridge a JS number arrives as a Double (boxed NSNumber);
  /// a JS array arrives as [Any] whose elements are NSNumber. We accept the
  /// common numeric boxings defensively. A single non-numeric array element
  /// invalidates the whole uniform (return nil) rather than zero-filling it,
  /// matching ShaderUniforms.kt.
  private static func normalize(_ value: Any) -> [Float]? {
    switch value {
    case let d as Double:
      return [Float(d)]
    case let f as Float:
      return [f]
    case let i as Int:
      return [Float(i)]
    // NSNumber covers the bridged-number case on platforms where the cast to
    // Double does not fire first; also covers Bool-boxed-as-number defensively.
    case let n as NSNumber:
      return [n.floatValue]
    case let arr as [Any]:
      var out = [Float]()
      out.reserveCapacity(arr.count)
      for element in arr {
        if let n = element as? NSNumber {
          out.append(n.floatValue)
        } else if let d = element as? Double {
          out.append(Float(d))
        } else if let f = element as? Float {
          out.append(f)
        } else if let i = element as? Int {
          out.append(Float(i))
        } else {
          return nil
        }
      }
      return out
    default:
      return nil
    }
  }
}
