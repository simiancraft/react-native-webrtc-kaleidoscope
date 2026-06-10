// Bundled-image URL resolution, kept after the per-effect art processors were
// folded into the composite compositor (Phase C of the effect-unification plan).
//
// The standalone BackgroundImageProcessor / ShaderProcessor / BlurProcessor are
// gone; their work now lives in CompositeProcessor (the one "composite" compositor).
// Two small responsibilities those files used to host outlived them and live
// here so nothing else has to reach into a deleted type:
//
//   - bundledURL(for:): resolve a bundled background `<id>.webp` for the picker's
//     native thumbnail (the Expo `resolveImageUri` function in
//     KaleidoscopeModule). Same lookup the old BackgroundImageProcessor used, so
//     the thumbnail still resolves to the exact file the compositor would load.
//   - the `Bundle(for:)` anchor: a stable class whose framework/app bundle the
//     ShaderLibrary / GENERATIVE.txt lookups resolve relative to (was
//     `Bundle(for: BackgroundImageProcessor.self)`).
//
// `BundleAnchor` is an empty NSObject solely so `Bundle(for:)` has a type that
// lives in this module's binary; an enum cannot be passed to `Bundle(for:)`.

import Foundation

/// Stable type whose containing bundle anchors the Kaleidoscope resource-bundle
/// lookups (ShaderLibrary, GENERATIVE.txt, background thumbnails). Empty by design.
final class BundleAnchor: NSObject {}

enum BundledImage {
    /// Resolve a bundled image `<id>.webp`, searching the app bundle first
    /// (the prebuild plugin copies every referenced image into the app target, so
    /// they land flattened in `Bundle.main`) or, as a fallback, the Kaleidoscope
    /// resource bundle and its `images/` subdir. The compositor loads the
    /// same images; shared by the JS thumbnail resolver (`resolveImageUri`).
    static func bundledURL(for id: String) -> URL? {
        let containing = Bundle(for: BundleAnchor.self)
        let resourceBundle = Bundle.kaleidoscopeResources(relativeTo: containing) ?? containing
        return Bundle.main.url(forResource: id, withExtension: "webp")
            ?? resourceBundle.url(forResource: id, withExtension: "webp", subdirectory: "images")
            ?? resourceBundle.url(forResource: id, withExtension: "webp")
    }
}
