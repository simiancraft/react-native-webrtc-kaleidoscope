// Loads a single transpiled .metal file into its own MTLLibrary at runtime.
//
// WHY runtime makeLibrary(source:) instead of makeDefaultLibrary():
//   All three shaders (passthrough, blur, composite) export the SAME entry
//   point name `main0`; spirv-cross emits `main0` for every stage. A single
//   metallib cannot hold three functions all named `main0`, so the default
//   library that the build phase compiles from the globbed *.metal files
//   would have a name collision. Renaming the entry points is fragile because
//   the next run of scripts/transpile-shaders.ts would regenerate `main0` and
//   silently undo the rename. Compiling each .metal source separately at
//   runtime keeps each `main0` in its own namespace and survives transpiler
//   regeneration with zero coupling to the build phase.
//
// COST: a one-time per-process compile of three small shaders at first
// renderer construction (a few ms each). Acceptable; it happens once, off the
// per-frame path, the first time an effect runs.
//
// The .metal files ship as resources inside the Kaleidoscope.bundle: the
// podspec's resource_bundles glob copies KaleidoscopeModule/shaders/*.metal
// into the bundle, and we read that SOURCE TEXT here. They are also still in
// source_files so the build phase validates that they compile, but the
// compiled metallib that produces is unused (it would collide on `main0`
// anyway). See Kaleidoscope.podspec.

import Foundation
import Metal
import os.log

struct ShaderLibrary {
  private let library: MTLLibrary

  /// Compiles `<fileName>.metal` (read from the Kaleidoscope bundle) into a
  /// standalone MTLLibrary.
  init(device: MTLDevice, bundle: Bundle, fileName: String) throws {
    guard let url = ShaderLibrary.locate(fileName: fileName, bundle: bundle) else {
      throw RendererError.libraryCompileFailed("\(fileName).metal not found in bundle")
    }
    let source: String
    do {
      source = try String(contentsOf: url, encoding: .utf8)
    } catch {
      throw RendererError.libraryCompileFailed(
        "read \(fileName).metal failed: \(error.localizedDescription)"
      )
    }
    do {
      self.library = try device.makeLibrary(source: source, options: nil)
    } catch {
      throw RendererError.libraryCompileFailed(
        "compile \(fileName).metal failed: \(error.localizedDescription)"
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

  /// Resolve `<fileName>.metal`. Tries the nested Kaleidoscope resource bundle
  /// first (the normal install layout for an autolinked pod), then the given
  /// bundle directly, then `shaders/` subpaths under each. The breadth covers
  /// both the resource_bundles install layout and a flattened test layout.
  private static func locate(fileName: String, bundle: Bundle) -> URL? {
    let candidateBundles = [Bundle.kaleidoscopeResources(relativeTo: bundle), bundle].compactMap { $0 }
    for candidate in candidateBundles {
      if let url = candidate.url(forResource: fileName, withExtension: "metal") {
        return url
      }
      if let url = candidate.url(forResource: fileName, withExtension: "metal", subdirectory: "shaders") {
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
