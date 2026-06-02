// swift-tools-version:5.9
//
// Standalone SwiftPM harness for the iOS composite layer-stack parser.
//
// It compiles ONLY the real ios/KaleidoscopeModule/CompositeLayers.swift (symlinked
// into Sources/CompositeLayersKit, so there is one source of truth) and runs the
// XCTest mirror of the Android CompositeLayersTest against it. The file is pure
// Foundation + os.log, so no Expo, Metal, MediaPipe, or WebRTC dependency is
// needed; `swift test` builds and runs it in seconds on any mac.
//
// This package lives OUTSIDE ios/ on purpose: the podspec globs
// KaleidoscopeModule/**/*.swift into the shipping pod, and the npm `files`
// allowlist ships ios/ wholesale, so an XCTest file under either would leak
// XCTest into a production build. Top-level ios-tests/ ships nowhere.
//
// Runner note: this cannot run on Linux (os.log / os_unfair_lock are Darwin
// only, and there is no Swift toolchain in the WSL dev box). It is a mac/CI
// gate. Run from this directory: `swift test`.

import PackageDescription

let package = Package(
  name: "CompositeLayersKit",
  platforms: [.macOS(.v11)],
  targets: [
    .target(name: "CompositeLayersKit", path: "Sources/CompositeLayersKit"),
    .testTarget(
      name: "CompositeLayersKitTests",
      dependencies: ["CompositeLayersKit"],
      path: "Tests/CompositeLayersKitTests"
    ),
  ]
)
