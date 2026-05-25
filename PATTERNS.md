# Codebase patterns

Where to put what, across the four surfaces this library exposes (JS facade,
web pipeline, Android native, iOS native). The layout encodes a few load-bearing
distinctions; honor them when adding code so future contributors find what they
expect.

## Surfaces

```
src/                                   JS facade and shared types
├── index.ts                           native entry (Metro picks via "react-native" condition)
├── index.web.ts                       web entry (Metro picks via "browser" condition)
├── types.ts                           EffectSpec discriminated union, ApplyVideoEffects
├── backgrounds/                       preset catalog (presets.ts) + per-preset source modules (single source of truth)
└── web/                               web-only implementation
    ├── insertable-streams.ts            MediaStreamTrackProcessor wiring
    ├── segmenter.ts                     MediaPipe Selfie Segmentation loader (shared)
    ├── shaders.ts                       all GLSL source for every web effect
    └── effects/                         one file per effect; owns its GL state and per-frame transform
        ├── transform.ts                  flip-x/flip-y/rotate-cw/rotate-ccw (replaced mirror.ts)
        ├── blur.ts
        └── background-image.ts

android/src/main/java/com/simiancraft/kaleidoscope/
├── KaleidoscopeModule.kt              Expo Module entry (OnCreate calls Registration.registerAll)
├── Registration.kt                    flat-string registry: name -> VideoFrameProcessorFactoryInterface
├── effects/                           one VideoFrameProcessorFactory per effect
│   ├── TransformFactory.kt              flip-x/flip-y/rotate-cw/rotate-ccw (replaced MirrorFactory.kt)
│   ├── BlurFactory.kt
│   └── BackgroundImageFactory.kt
├── gpu/                               pure GL primitives, no domain logic
│   ├── Ingest.kt                        THE one place camera orientation is normalized (display rotation + dims)
│   ├── Orientation.kt                   screen-space transform-op matrices (no frame.rotation dependence)
│   ├── FramePipeline.kt                 one-frame GPU pipeline (fence handoff; replaced per-frame glFinish)
│   ├── Egl.kt                           state save/restore, matrix conversion
│   ├── Fbo.kt                           FBO + texture allocator
│   ├── GlProgram.kt                     shader compile/link
│   ├── GlDebug.kt                       glGetError logging
│   ├── GpuEffectFactory.kt              architecture-proof passthrough factory (v0.1 cleanup target)
│   ├── GpuEffectProcessor.kt            architecture-proof passthrough processor (v0.1 cleanup target)
│   └── Shaders.kt                       all GLSL source for every Android effect
└── segmentation/                      person-segmentation helpers (MediaPipe on Android)
    ├── Mask.kt                          async MediaPipe worker + last-known-mask cache
    └── MaskTuning.kt                    smoothstep range from a [0,1] hardness factor

ios/KaleidoscopeModule/
├── KaleidoscopeModule.swift           Expo Module entry (mirrors Android)
├── Registration.swift                 flat-string registry: transform ops, blur, background-image
├── effects/                           one VideoFrameProcessorDelegate per effect
│   ├── TransformProcessor.swift         flip-x/flip-y/rotate-cw/rotate-ccw (replaced MirrorProcessor.swift)
│   ├── BlurProcessor.swift
│   ├── BackgroundImageProcessor.swift
│   └── FrameBridge.swift                RTCVideoFrame <-> CVPixelBuffer in/out bridge
├── gpu/                               Metal + CoreImage primitives
│   ├── Ingest.swift                     THE one place camera orientation is normalized (display rotation + selfie mirror)
│   ├── Orientation.swift                screen-space transform-op matrices (no frame.rotation dependence)
│   ├── MetalRenderer.swift              pipelines + passes (blur, composite, transform); pixel-buffer pool
│   └── TextureBridge.swift              NV12->BGRA ingest, mask CVPixelBufferPool, Metal texture cache
└── segmentation/                      person-segmentation helpers (Vision on iOS)
    └── Segmenter.swift                  VNGeneratePersonSegmentationRequest worker; owns mask buffers via a pool

plugin/
└── src/
    └── withKaleidoscope.ts            Expo config plugin (currently a passthrough)
```

## Conventions

### Where a new GLSL shader goes

Canonical GLSL lives in `shaders/*.frag` and `shaders/*.vert` at the repo
root. That is the single source of truth across platforms. `bun run
build:shaders` (`scripts/build-shaders.ts`) reads it and generates each
runtime's artifacts; the generated outputs are never hand-edited.

For iOS, the `.frag` / `.vert` source goes through a transpiler:

```
GLSL ES 3.00  ->  SPIR-V         ->  MSL (Metal Shading Language)
              glslangValidator         spirv-cross --msl
```

The script `scripts/build-shaders.ts` runs the chain, validates each
step (`spirv-val` between stages), and writes `.metalsrc` files into
`ios/KaleidoscopeModule/shaders/`. The committed `.metalsrc` files are what
the iOS build compiles at runtime; the EAS macOS host does not need the
transpiler binaries installed.

Tool install:
- Debian/Ubuntu/WSL: `sudo apt install -y glslang-tools spirv-tools spirv-cross`
- macOS: `brew install glslang spirv-tools spirv-cross`

Run after editing any `.frag` / `.vert`, then commit the regenerated files:
- `bun run build:shaders`

CI enforces freshness with `bun run check:shaders`: it regenerates and
`git diff --exit-code`s the **deterministic** codegen (`ShadersGenerated.kt`,
`shaders.generated.ts`), so a `.frag` edit pushed without regenerating fails
the build. The transpiled `.metalsrc` is intentionally NOT diffed — spirv-cross
emits slightly different MSL across tool versions, so diffing it across
machines would flag false drift; the Kotlin/TS copies already catch any stale
`.frag`. The check is CI-only, so contributors who don't touch shaders need
not install the glslang/spirv toolchain locally.

Per-platform outputs (generated from the canonical `shaders/*` files; do
not hand-edit):
- Web: `src/web/shaders.generated.ts` (`*_SRC` consts), re-exported by
  `src/web/shaders.ts`.
- Android: `android/.../gpu/ShadersGenerated.kt` (`const val` strings),
  delegated by `Shaders.kt`. Platform-local shaders with no cross-runtime
  twin (OES external texture, 2D passthrough) stay hand-written in
  `Shaders.kt` / `Mask.kt`.
- iOS: `ios/KaleidoscopeModule/shaders/*.metalsrc`.

The composite shader (`shaders/composite.frag`) is the canonical mix-with-
mask shader; every effect category (blur, background-image, future
procedural backgrounds like Simianlights and Nebula) uses it unchanged.
Per-effect shaders (currently `shaders/blur.frag`, `shaders/transform.frag`)
live as separate files under `shaders/`.

It is **background-source-agnostic**: `mix(background, original, mask)` does
not care whether `uBackground` is a loaded image, the blurred camera, or a
procedural shader's output; a new effect differs only in how it produces that
texture. Because orientation is normalized upstream at the ingest (see
"Orientation" below), a new shader composites correctly on every platform with
no orientation code — that is the whole extensibility model for procedural
backgrounds (issue #25).

### Orientation: normalized once at the ingest (load-bearing; do not re-correct per effect)

Camera orientation is handled in exactly ONE place: the ingest.
`android/.../gpu/Ingest.kt` and `ios/.../gpu/Ingest.swift` fold the frame's
display rotation (and, on iOS, the front-camera selfie mirror) into the
camera→"original 2D" step, so every downstream pass samples an already
display-upright, non-mirrored frame, and every effect emits `rotation 0`.
Consequences a contributor must not undo:

- `Orientation.{kt,swift}` (`mat2For` / `uvTransform`) are pure SCREEN-SPACE
  matrices for the transform ops (flip-x = negate U, flip-y = negate V,
  rotate-cw/ccw = axis swap). They do NOT read `frame.rotation`.
- The background-image composite samples the PNG directly — no pre-orient pass.
- There is NO per-effect orientation correction anywhere. Adding one re-creates
  the "orientation cascade" this design removed (it surfaced as "every fix
  breaks another effect" across web/Android/iOS during development).

If a device shows the WHOLE frame rotated or mirrored wrong, it is an ingest
calibration, not an effect bug: flip exactly one constant, per platform —
`Ingest.ROTATION_DIRECTION` (rotation sign) or `Ingest.INGEST_MIRROR_X`
(horizontal mirror). The web pipeline (canvas, display-space) is the
orientation source of truth; native must match it.

NOT orientation, and must not be "cleaned up" to identity: the composite's
V-flip parity terms. The vertical flip some composite paths need (odd
ping-pong pass count plus each platform's texture-origin convention) is
render-pass/texture parity, not camera orientation, and it lands on a
DIFFERENT uniform per platform: iOS blur uses `uBgUvScale=(1,-1)`; iOS background
negates `uBgUvScale.y` and sets `uBgUvOffset.y = offset.y+scale.y` composed WITH
the cover-fit (the MTKTextureLoader texture's V convention differs from the
CoreImage "original" at sample time); web blur and web background use
`uMaskUvScale=(1,-1)`; Android uses identity for both (its GL pipeline does not
accumulate the flip, and the background is pre-flipped on the bitmap instead).
The authoritative per-platform table is
in the `shaders/composite.frag` header. Do not cross-normalize these; zeroing
web's mask flip or copying iOS's bg flip onto Android breaks that platform.

### Segmentation mask buffer ownership

The mask the compositor reads must be a buffer the segmenter OWNS and hands out
fresh per cycle — Android allocates a fresh bitmap (`Mask.kt`), iOS dequeues
from a `CVPixelBufferPool` (`Segmenter.swift`). It must NOT be the live buffer
the segmentation framework hands back (Vision recycles it) or a shallow reused
ring: frame-pipelining keeps a mask texture GPU-referenced across multiple
cycles, so a 2-deep ring gets overwritten mid-read and the mask visibly drifts
and contorts. Preserve fresh-per-cycle ownership if you touch the segmenter.

### Texture-orientation convention

Every input texture in the GLSL pipeline lands with its semantic "top of
source image" at GL `v=1`. The composite samples every texture at `vUv`
directly with no V-flips at sample time. Each platform's host code picks
the right upload flag or pre-flip to enforce the convention:

- **Web original / mask / background**: `UNPACK_FLIP_Y_WEBGL = true` on
  `gl.texImage2D` (DOM sources are top-down; the flip lands `v=1` at top).
- **Android original**: the OES->2D pass with `uTexMatrix` lands the
  displayable top at GL `v=1` already.
- **Android mask**: the readback round-trip cancels out (`glReadPixels`
  bottom-up plus Bitmap top-down plus `GLUtils.texImage2D` preserving row
  order); mask texture lands head at `v=1` without any extra step.
- **Android background**: pre-flip the bitmap via
  `Bitmap.createBitmap(bmp, 0, 0, w, h, Matrix(preScale(1, -1)), false)`
  before `GLUtils.texImage2D`. Android OpenGL ES has no `UNPACK_FLIP_Y`
  flag, so the flip has to happen on the bitmap.
- **iOS original / mask**: the `CVMetalTextureCacheCreateTextureFromImage`
  views of the CoreImage-rendered "original" and the segmenter mask
  composite correct at plain `vUv` (verified on-device); the ingest already
  lands the displayable top consistently for that path.
- **iOS background**: `MTKTextureLoader` (`.origin = .topLeft`) loads a
  STANDALONE image, not a CVPixelBuffer; at Metal sample time its top row
  lands at the opposite V end from the CoreImage "original", so it needs a
  V-flip. The flip is folded into `uBgUvScale.y`/`uBgUvOffset.y` composed
  with the cover-fit (negate `scale.y`; `offset.y' = offset.y + scale.y`),
  NOT done at load, so the load-time "row 0 = top" convention stays uniform
  with the foreground and the flip is visible at the call site.

The convention is enforced upstream of the shader so the shader stays
genuinely cross-platform. If a future texture source does not naturally
land "top at v=1", the right fix is at the upload boundary, not in the
shader.

### Where a new effect goes

Four things, in order:

1. **Spec**: add a new branch to `EffectSpec` in `src/types.ts`. Add the
   discriminant string to `ANDROID_REGISTERED_EFFECTS` in `src/index.ts`.
2. **Web**: a new file under `src/web/effects/<name>.ts` exporting a
   `FrameTransform`. Add the case to `specToTransform` in `src/index.web.ts`.
3. **Android**: a new `effects/<Name>Factory.kt` implementing
   `VideoFrameProcessorFactoryInterface`. Add a
   `ProcessorProvider.addProcessor("<name>", <Name>Factory(...))` line to
   `Registration.kt`. If the effect needs new GLSL, add to `gpu/Shaders.kt`.
4. **iOS**: a new `effects/<Name>Processor.swift` conforming to
   `RTCVideoFrameProcessor`. Add the registration to `Registration.swift`.

The native side uses a flat-string registry (`ProcessorProvider.addProcessor`)
because the upstream `react-native-webrtc` `_setVideoEffects` API takes
`string[]`. Parameterized specs (`{name: 'blur', sigma: 5}`) get the spec
parameters dropped on the native side today; wiring them through is a v0.2
conversation.

### Where a new background preset goes

Single source of truth: `src/backgrounds.ts`. Append the preset name to
`BACKGROUND_PRESETS`. Then:

- Drop `<name>.png` into `android/src/main/assets/backgrounds/`.
- Add a `ProcessorProvider.addProcessor("background-image-<name>",
  BackgroundImageFactory(context, "<name>"))` line to `Registration.kt`.
- Add a `<name>: require('./assets/backgrounds/<name>.png')` entry to the
  demo's preset map.

The JS allowlist and type-level autocomplete (`BackgroundPresetName`) pick
up the new preset automatically from the catalog.

### Where GL pipeline helpers go

`android/.../gpu/` is for pure GL primitives that have no domain knowledge:
FBO allocation, shader compile/link, EGL state save/restore, shader source
strings. If a helper does anything *with* the pipeline (mask production,
specific effects' state, etc.), it goes in a domain folder
(`segmentation/`, `effects/`).

The iOS equivalent is `ios/KaleidoscopeModule/gpu/` — Metal + CoreImage
primitives with no domain logic: `Ingest.swift` (orientation normalization),
`Orientation.swift` (transform-op matrices), `MetalRenderer.swift` (pipelines
and passes), `TextureBridge.swift` (ingest + texture/pool utilities). The Metal
port added this folder; earlier iOS had none when CoreImage did everything.
Per-domain logic still lives in `effects/` and `segmentation/`.

### Where Expo Module DSL lives

Always `KaleidoscopeModule.{kt,swift}`. The `Module { ... }` block stays
minimal: `Name(...)`, `OnCreate { Registration.registerAll(...) }`, and
any `Function`/`AsyncFunction`/`Property`/`Events` declarations the JS
facade calls into. Long lists of `Function` definitions get extracted into
sibling files when count earns it; none today.

### Where new runtime effect parameters go

Effect parameters that callers should be able to tweak at runtime (blur
sigma, mask hardness, etc.) flow through a three-tier mirror:

1. **Native state**: `android/.../EffectTuning.kt` and
   `ios/.../EffectTuning.swift` hold the mutable values with custom
   setters that clamp to valid ranges. Per-frame processors read these
   values each frame, so changes take effect on the next frame without
   re-registering processors.
2. **Web state**: `src/web/tuning.ts` mirrors the same shape; per-frame
   `FrameTransform`s in `src/web/effects/*.ts` read from it when uploading
   uniforms.
3. **JS facade**: `src/index.ts` and `src/index.web.ts` export the same
   `set<Param>(value)` functions, native versions calling
   `requireNativeModule('RnWebrtcKaleidoscope').setX(value)`, web versions
   mutating `src/web/tuning.ts` directly.

The Expo Module's `Function("setX") { value -> EffectTuning.x = value }`
declarations in `KaleidoscopeModule.{kt,swift}` provide the bridge between
JS and native state. This side-channels the upstream rn-webrtc
flat-string registry, which has no concept of effect parameters; the
registry stays as it is and parameters travel through the Expo Module API.

To add a new parameter:
- Add a `var` with a clamping custom setter to all three `EffectTuning`
  files (Kotlin object, Swift enum, TS class).
- Add a `Function("setNewParam") { value -> EffectTuning.newParam = value }`
  to both `KaleidoscopeModule` files.
- Add a `setNewParam(value: number)` export to both `src/index.ts` and
  `src/index.web.ts`.
- Have the relevant processor / `FrameTransform` read the new value when
  uploading its uniforms.
- Add a slider row in `demo/src/effect-tuning-panel.tsx`.

## Out-of-scope organization

These were considered and rejected for the current scale; revisit when
pressure grows.

- **Cross-platform effect-interface abstraction.** Upstream rn-webrtc forces
  flat-string names; no bytecode contract crosses Kotlin / Swift / TS. The
  three hand-rolled `Registration.{kt,swift}` plus the JS allowlist is
  genuinely the right shape at four effects.
- **Shared GLSL source files.** Right answer long-term; the duplication is
  bearable at four shaders. Needs a Metro transformer on web and an Android
  assets loader; not free.
- **Codegen sync of background-preset list to Android Registration.kt.** The
  catalog lives in TS; Kotlin manually mirrors the names with a comment
  pointing at `src/backgrounds.ts`. At two presets this is fine.
