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

The Android and web GLSL shapes are kept in sync manually; a comment in
`Shaders.kt` references `src/web/shaders.ts`. Extracting to shared `.frag`
files with a Metro transformer + Android asset-loader is a v0.2 conversation.

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
