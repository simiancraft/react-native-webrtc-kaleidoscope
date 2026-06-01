# ios-tests

A standalone SwiftPM harness for the iOS **scene layer-stack parser**
(`ios/KaleidoscopeModule/SceneLayers.swift`). It is the iOS half of the
cross-platform parity suite; the Android half is
`android/src/test/java/com/simiancraft/kaleidoscope/SceneLayersTest.kt`, run by
`testDebugUnitTest`.

The two test files mirror each other case for case. The parser is the contract
between `serializeSceneLayers` (`src/index.ts`, the single producer of the wire
JSON) and the native compositors; if the Kotlin and Swift parsers disagree on a
shared case, one side's suite fails.

## Run

```sh
cd ios-tests
swift test
```

Needs a Swift toolchain. It builds **only** the one real source file (symlinked
into `Sources/SceneLayersKit/`, so there is one source of truth), with no Expo,
Metal, MediaPipe, or WebRTC dependency, so it builds and runs in seconds.

`SceneLayers.swift` uses `os.log` and `os_unfair_lock`, which are Darwin only, so
this runs on **macOS, not Linux** (and not in the current ubuntu-only CI). It
ships nowhere: it sits outside `ios/` so the podspec's `KaleidoscopeModule/**`
glob and the npm `files` allowlist (which ships `ios/` wholesale) cannot pull
XCTest into a production build.

## Shared contract (must agree on both platforms)

- root must be a JSON array, else the whole payload is rejected and the previous
  scene is kept
- each element must be an object, else it is skipped
- `shader` is required and non-empty, else that layer is skipped
- `target` defaults to `"background"`
- `blend` is optional (nil when absent; the base layer reads nil as opaque)
- `source` is optional (the plate id for an `image` layer)
- a uniform value: a number normalizes to `[f]`; a numeric array stays a vector;
  anything else is skipped (the shader keeps its default for that name)

## Known divergences (NOT covered by the shared cases, by design)

These come from `org.json` (Android) vs Foundation `JSONSerialization` (iOS) and
only occur on inputs `serializeSceneLayers` never emits, so they are harmless
today. They are documented, not tested, until we decide to converge or keep them:

1. **Boolean uniform value.** `{"uColor": true}` — iOS accepts it as `1.0`
   (Foundation deserializes JSON bools as `NSNumber`); Android skips it
   (`org.json` yields a `Boolean`, not a `Number`).
2. **Wrong-typed `shader`.** `{"shader": 5}` — Android coerces to `"5"` and keeps
   the layer; iOS skips it (a non-`String` fails the cast).
3. **Wrong-typed `target`.** `{"target": 1}` — Android coerces to `"1"`; iOS
   falls back to `"background"`.
