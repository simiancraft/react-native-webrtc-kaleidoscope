// Mutable runtime parameters for the GLSL effects on iOS. Mirrors the
// Android side at android/.../EffectTuning.kt and the web side at
// src/web/tuning.ts.
//
// The Expo Module's setBlurSigma / setMaskHardness JS functions update
// these values via the bridge; per-frame processors read them on every
// frame so JS-side tweaks take effect without re-registering processors.
//
// The iOS Metal effects read these values per frame; the shape mirrors the
// Android (EffectTuning.kt) and web (tuning.ts) state so the JS API is
// identical across platforms.

import Foundation

/// Person-segmentation quality, mapped to VNGeneratePersonSegmentationRequest.
/// QualityLevel. Stored as a small enum so the JS bridge can pass a string and
/// the Segmenter can switch without importing Vision into the tuning store.
public enum SegmentationQuality: String {
  case fast
  case balanced
  case accurate

  /// Parse a JS-supplied string, defaulting to `.fast` on anything unexpected.
  public static func from(_ raw: String) -> SegmentationQuality {
    SegmentationQuality(rawValue: raw.lowercased()) ?? .fast
  }
}

public enum EffectTuning {
  // os_unfair_lock is the iOS 13+ recommended primitive for cheap
  // serialization of cross-thread state. NSLock would also work; we use
  // unfair_lock for vocabulary parity with the planned Segmenter pattern.
  private static var unsafeLock = os_unfair_lock_s()

  private static var _blurSigma: Float = 5.0
  private static var _maskHardness: Float = 0.5
  private static var _maskThreshold: Float = 0.7
  // Short-side (in px) the camera buffer is downscaled to before the Vision
  // person-segmentation request runs. The produced mask is lower-res; the
  // composite upsamples it with a LINEAR sampler, so the quality cost is small
  // and the Vision cost drop is large. A later JS device-tier drives this so
  // an A11-class device can request a smaller mask than an A16.
  private static var _targetShortSide: Int = 384
  // .balanced, not .fast or .accurate: the clean-frame mask is already good (the
  // real iOS problem was buffer drift, fixed separately), so a modest bump from
  // .fast is enough; .accurate was historically too slow. A later device-tier
  // can raise to .accurate or drop to .fast.
  private static var _segmentationQuality: SegmentationQuality = .balanced
  // When true, the GPU/Vision/ingest timing instrument logs under os_log
  // category "Perf". Off by default; a debug build or a JS toggle turns it on
  // to confirm the bottleneck on an EAS build (no attachable profiler there).
  private static var _debugTiming = false

  public static var blurSigma: Float {
    get {
      os_unfair_lock_lock(&unsafeLock)
      defer { os_unfair_lock_unlock(&unsafeLock) }
      return _blurSigma
    }
    set {
      let clamped = min(max(newValue, 0.5), 7.0)
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

  public static var maskThreshold: Float {
    get {
      os_unfair_lock_lock(&unsafeLock)
      defer { os_unfair_lock_unlock(&unsafeLock) }
      return _maskThreshold
    }
    set {
      let clamped = min(max(newValue, 0.05), 0.95)
      os_unfair_lock_lock(&unsafeLock)
      _maskThreshold = clamped
      os_unfair_lock_unlock(&unsafeLock)
    }
  }

  public static var targetShortSide: Int {
    get {
      os_unfair_lock_lock(&unsafeLock)
      defer { os_unfair_lock_unlock(&unsafeLock) }
      return _targetShortSide
    }
    set {
      let clamped = min(max(newValue, 128), 1080)
      os_unfair_lock_lock(&unsafeLock)
      _targetShortSide = clamped
      os_unfair_lock_unlock(&unsafeLock)
    }
  }

  public static var segmentationQuality: SegmentationQuality {
    get {
      os_unfair_lock_lock(&unsafeLock)
      defer { os_unfair_lock_unlock(&unsafeLock) }
      return _segmentationQuality
    }
    set {
      os_unfair_lock_lock(&unsafeLock)
      _segmentationQuality = newValue
      os_unfair_lock_unlock(&unsafeLock)
    }
  }

  public static var debugTiming: Bool {
    get {
      os_unfair_lock_lock(&unsafeLock)
      defer { os_unfair_lock_unlock(&unsafeLock) }
      return _debugTiming
    }
    set {
      os_unfair_lock_lock(&unsafeLock)
      _debugTiming = newValue
      os_unfair_lock_unlock(&unsafeLock)
    }
  }

  public static func reset() {
    os_unfair_lock_lock(&unsafeLock)
    _blurSigma = 5.0
    _maskHardness = 0.5
    _maskThreshold = 0.7
    _targetShortSide = 384
    _segmentationQuality = .balanced
    // debugTiming is intentionally NOT reset here: it is an instrument toggle,
    // not an effect parameter, so resetEffectTuning() should not silence it.
    os_unfair_lock_unlock(&unsafeLock)
  }
}
