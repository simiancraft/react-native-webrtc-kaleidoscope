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
├── backgrounds.ts                     bundled background-preset catalog (single source of truth)
└── web/                               web-only implementation
    ├── insertable-streams.ts            MediaStreamTrackProcessor wiring
    ├── segmenter.ts                     MediaPipe Selfie Segmentation loader (shared)
    ├── shaders.ts                       all GLSL source for every web effect
    └── effects/                         one file per effect; owns its GL state and per-frame transform
        ├── mirror.ts
        ├── blur.ts
        ├── background-image.ts
        └── passthrough.ts

android/src/main/java/com/simiancraft/kaleidoscope/
├── KaleidoscopeModule.kt              Expo Module entry (OnCreate calls Registration.registerAll)
├── Registration.kt                    flat-string registry: name -> VideoFrameProcessorFactoryInterface
├── effects/                           one VideoFrameProcessorFactory per effect
│   ├── MirrorFactory.kt
│   ├── BlurFactory.kt
│   └── BackgroundImageFactory.kt
├── gpu/                               pure GL primitives, no domain logic
│   ├── Egl.kt                           state save/restore, matrix conversion
│   ├── Fbo.kt                           FBO + texture allocator
│   ├── GlProgram.kt                     shader compile/link
│   ├── GlDebug.kt                       glGetError logging
│   ├── GpuEffectFactory.kt              architecture-proof passthrough factory (v0.1 cleanup target)
│   ├── GpuEffectProcessor.kt            architecture-proof passthrough processor (v0.1 cleanup target)
│   └── Shaders.kt                       all GLSL source for every Android effect
└── segmentation/                      person-segmentation helpers (MLKit on Android)
    ├── Mask.kt                          async MLKit worker + last-known-mask cache
    └── MaskTuning.kt                    smoothstep range from a [0,1] hardness factor

ios/KaleidoscopeModule/
├── KaleidoscopeModule.swift           Expo Module entry (mirrors Android)
├── Registration.swift                 flat-string registry (currently a no-op stub)
├── effects/                           one RTCVideoFrameProcessor conformance per effect
│   ├── MirrorProcessor.swift
│   └── BlurProcessor.swift
└── segmentation/                      person-segmentation helpers (Vision on iOS)
    └── Segmenter.swift                  VNGeneratePersonSegmentationRequest worker

plugin/
└── src/
    └── withKaleidoscope.ts            Expo config plugin (currently a passthrough)
```

## Conventions

### Where a new GLSL shader goes

Each platform has one file. Add the source string there; the effect that uses
it imports the constant.

- Web: `src/web/shaders.ts`. Exports `*_SRC` constants.
- Android: `android/.../gpu/Shaders.kt`. Exports `const val` strings on the `Shaders` object.
- iOS: no GLSL; iOS uses CoreImage filter chains or Vision requests. The equivalent of "where do I add a new shader" is "where do I add a new CIFilter / VNRequest", which is inside the effect file.

The composite shader (`COMPOSITE_FRAG` on Android, `COMPOSITE_FRAG_SRC` on
web) is kept byte-identical between the two platforms. Per-effect shaders
(`BLUR_FRAG`, future Simianlights / Nebula) currently still differ
implementation-by-implementation; lifting them to a shared `.frag` source
with a transpiler pipeline is the next architectural step.

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
- **iOS** (when it lands): `CVMetalTextureCacheCreateTextureFromImage`
  produces a top-down texture by default; pre-flip at upload (or run a
  one-pass blit through a flipped intermediate) to land `v=1` = top.

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

The iOS equivalent is `ios/KaleidoscopeModule/<domain>/`. There is no `gpu/`
on iOS because the CoreImage / Vision frameworks already provide that layer;
shared CoreImage utilities would live in `effects/` or a future
`coreimage/` subdir if pressure grows.

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
