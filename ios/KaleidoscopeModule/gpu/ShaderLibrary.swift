// Loads a single transpiled .metalsrc file into its own MTLLibrary at runtime.
//
// WHY runtime makeLibrary(source:) instead of makeDefaultLibrary():
//   All three shaders (passthrough, blur, composite) export the SAME entry
//   point name `main0`; spirv-cross emits `main0` for every stage. A single
//   metallib cannot hold three functions all named `main0`, so the default
//   library that the build phase compiles from the globbed *.metal files
//   would have a name collision. Renaming the entry points is fragile because
//   the next run of scripts/transpile-shaders.ts would regenerate `main0` and
//   silently undo the rename. Compiling each .metalsrc source separately at
//   runtime keeps each `main0` in its own namespace and survives transpiler
//   regeneration with zero coupling to the build phase.
//
// COST: a one-time per-process compile of three small shaders at first
// renderer construction (a few ms each). Acceptable; it happens once, off the
// per-frame path, the first time an effect runs.
//
// The files ship as resources inside the Kaleidoscope.bundle using a custom
// `.metalsrc` extension precisely because `.metal` files in a resource bundle
// trigger Xcode's MetalCompile build phase for the bundle target, which would
// compile all three into a single `default.metallib` inside the bundle and
// collide on the three `main0` entry points (air-lld duplicate-symbol errors
// at link time); exactly the collision the source_files exclusion already
// avoids for the main target. The podspec's resource_bundles glob copies
// KaleidoscopeModule/shaders/*.metalsrc into the bundle as plain text, and we
// read that SOURCE TEXT here via String(contentsOf:), then hand it to
// device.makeLibrary(source:) so each `main0` lives in its own MTLLibrary.
// See Kaleidoscope.podspec.

import Foundation
import Metal
import os.log

struct ShaderLibrary {
  private let library: MTLLibrary

  /// The raw MSL source text this library was compiled from. Retained so the
  /// generic generative-shader path can parse the spirv-cross `[[buffer(n)]]`
  /// decorations out of it (see uniformBufferIndices); the only tractable way
  /// to bind arbitrary-named uniforms by index without per-shader Swift. The
  /// fixed-binding shaders (passthrough/blur/composite/transform) ignore it.
  let source: String

  /// Compiles `<fileName>.metalsrc` (read from the Kaleidoscope bundle) into a
  /// standalone MTLLibrary.
  init(device: MTLDevice, bundle: Bundle, fileName: String) throws {
    guard let url = ShaderLibrary.locate(fileName: fileName, bundle: bundle) else {
      throw RendererError.libraryCompileFailed("\(fileName).metalsrc not found in bundle")
    }
    let source: String
    do {
      source = try String(contentsOf: url, encoding: .utf8)
    } catch {
      throw RendererError.libraryCompileFailed(
        "read \(fileName).metalsrc failed: \(error.localizedDescription)"
      )
    }
    self.source = source
    do {
      self.library = try device.makeLibrary(source: source, options: nil)
    } catch {
      throw RendererError.libraryCompileFailed(
        "compile \(fileName).metalsrc failed: \(error.localizedDescription)"
      )
    }
  }

  /// Returns the `main0` function for this library's stage.
  func function() throws -> MTLFunction {
    guard let fn = library.makeFunction(name: "main0") else {
      throw RendererError.missingFunction("main0")
    }
    return fn
  }

  /// Parse the fragment-stage uniform name -> Metal buffer index map from the
  /// spirv-cross MSL source. This is the keystone of the GENERIC uniform binding
  /// (no per-shader Swift): spirv-cross emits each scalar/vector uniform as a
  /// `constant T& uName [[buffer(n)]]` argument on `main0`, and CRUCIALLY it does
  /// NOT preserve GLSL declaration order; plasma.metalsrc binds
  /// uResolution=0, uTime=1, uSpeed=2, uScale=3, uColorA=4, uColorB=5, which is
  /// neither GLSL order nor alphabetical. So a host-side name->index map MUST be
  /// derived from the actual decorations, not assumed. We match every
  /// `& <name> [[buffer(<n>)]]` token (the `&` distinguishes a `constant T&`
  /// uniform reference from a texture/sampler argument, which use `[[texture(n)]]`
  /// / `[[sampler(n)]]`). The leading `&` may be glued to the type (`float&`) or
  /// spaced; the regex tolerates optional whitespace. Texture and sampler
  /// arguments are intentionally NOT matched (different decoration), so a
  /// generative shader that also sampled a texture would not collide here.
  ///
  /// Returns e.g. ["uResolution": 0, "uTime": 1, "uSpeed": 2, ...] for plasma.
  /// The host binds uTime/uResolution itself and looks up every JS-set uniform
  /// by name in this map to find its buffer index. A uniform the shader does not
  /// declare is simply absent from the map and skipped at bind time.
  func uniformBufferIndices() -> [String: Int] {
    var indices = [String: Int]()
    // `& uName [[buffer(7)]]` with optional whitespace around the `&` and inside
    // the attribute. \w covers the u-prefixed identifier; the index is decimal.
    let pattern = #"&\s*([A-Za-z_][A-Za-z0-9_]*)\s*\[\[\s*buffer\s*\(\s*(\d+)\s*\)\s*\]\]"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return indices }
    let ns = source as NSString
    let matches = regex.matches(in: source, range: NSRange(location: 0, length: ns.length))
    for match in matches where match.numberOfRanges == 3 {
      let name = ns.substring(with: match.range(at: 1))
      let idxStr = ns.substring(with: match.range(at: 2))
      if let idx = Int(idxStr) {
        indices[name] = idx
      }
    }
    return indices
  }

  /// Resolve `<fileName>.metalsrc`. Tries the nested Kaleidoscope resource bundle
  /// first (the normal install layout for an autolinked pod), then the given
  /// bundle directly, then `shaders/` subpaths under each. The breadth covers
  /// both the resource_bundles install layout and a flattened test layout.
  private static func locate(fileName: String, bundle: Bundle) -> URL? {
    let candidateBundles = [Bundle.kaleidoscopeResources(relativeTo: bundle), bundle].compactMap { $0 }
    for candidate in candidateBundles {
      if let url = candidate.url(forResource: fileName, withExtension: "metalsrc") {
        return url
      }
      if let url = candidate.url(forResource: fileName, withExtension: "metalsrc", subdirectory: "shaders") {
        return url
      }
    }
    return nil
  }
}

extension Bundle {
  /// Resolves the `Kaleidoscope.bundle` that the podspec's `resource_bundles`
  /// produces. For an autolinked pod the resource bundle is nested inside the
  /// framework/app bundle that contains the Swift code; `relativeTo` is that
  /// containing bundle. Falls back to `Bundle(for:)` of a renderer type so a
  /// statically linked layout (resources merged into the host app) still
  /// resolves.
  static func kaleidoscopeResources(relativeTo containing: Bundle) -> Bundle? {
    if let url = containing.url(forResource: "Kaleidoscope", withExtension: "bundle"),
       let nested = Bundle(url: url) {
      return nested
    }
    return nil
  }
}
