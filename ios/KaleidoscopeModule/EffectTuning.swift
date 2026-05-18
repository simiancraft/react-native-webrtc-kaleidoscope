// Mutable runtime parameters for the GLSL effects on iOS. Mirrors the
// Android side at android/.../EffectTuning.kt and the web side at
// src/web/tuning.ts.
//
// The Expo Module's setBlurSigma / setMaskHardness JS functions update
// these values via the bridge; per-frame processors read them on every
// frame so JS-side tweaks take effect without re-registering processors.
//
// iOS processors are not yet implemented; values are stored here so the
// JS API is consistent across platforms once the iOS Metal port lands.

import Foundation

public enum EffectTuning {
  // os_unfair_lock is the iOS 13+ recommended primitive for cheap
  // serialization of cross-thread state. NSLock would also work; we use
  // unfair_lock for vocabulary parity with the planned Segmenter pattern.
  private static var unsafeLock = os_unfair_lock_s()

  private static var _blurSigma: Float = 8.0
  private static var _maskHardness: Float = 0.5

  public static var blurSigma: Float {
    get {
      os_unfair_lock_lock(&unsafeLock)
      defer { os_unfair_lock_unlock(&unsafeLock) }
      return _blurSigma
    }
    set {
      let clamped = min(max(newValue, 0.5), 64.0)
      os_unfair_lock_lock(&unsafeLock)
      _blurSigma = clamped
      os_unfair_lock_unlock(&unsafeLock)
    }
  }

  public static var maskHardness: Float {
    get {
      os_unfair_lock_lock(&unsafeLock)
      defer { os_unfair_lock_unlock(&unsafeLock) }
      return _maskHardness
    }
    set {
      let clamped = min(max(newValue, 0.0), 1.0)
      os_unfair_lock_lock(&unsafeLock)
      _maskHardness = clamped
      os_unfair_lock_unlock(&unsafeLock)
    }
  }

  public static func reset() {
    os_unfair_lock_lock(&unsafeLock)
    _blurSigma = 8.0
    _maskHardness = 0.5
    os_unfair_lock_unlock(&unsafeLock)
  }
}
