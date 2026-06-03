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
├── types.ts                           EffectSpec discriminated union, LayerSpec catalog, ApplyVideoEffects
└── web/                               web-only implementation
    ├── insertable-streams.ts            MediaStreamTrackProcessor wiring
    ├── segmenter.ts                     MediaPipe Selfie Segmentation loader (shared)
    ├── shaders.ts                       all GLSL source for every web effect
    └── effects/                         the composite compositor, its layer shaders, and the transform ops
        ├── composite.ts                  WebGL2 layered compositor (makeComposite); image/direct/blur/generative layers
        ├── layer-shaders.ts              per-layer GLSL the compositor compiles
        └── transform.ts                  flip-x/flip-y/rotate-cw/rotate-ccw (replaced mirror.ts)

android/src/main/java/com/simiancraft/kaleidoscope/
├── KaleidoscopeModule.kt              Expo Module entry (OnCreate calls Registration.registerAll)
├── Registration.kt                    flat-string registry: name -> VideoFrameProcessorFactoryInterface (four transform ops + "composite")
├── CompositeLayers.kt                 the layer stack JS delivers via setCompositeLayers (read per frame)
├── effects/                           the composite factory, its layer shaders, and the transform factory
│   ├── CompositeFactory.kt              builds the one "composite" compositor; image/direct/blur/generative layers
│   ├── LayerShaders.kt                  per-layer GLSL the compositor compiles
│   └── TransformFactory.kt              flip-x/flip-y/rotate-cw/rotate-ccw (replaced MirrorFactory.kt)
├── gpu/                               pure GL primitives, no domain logic
│   ├── Ingest.kt                        THE one place camera orientation is normalized (display rotation + dims)
│   ├── Orientation.kt                   screen-space transform-op matrices (no frame.rotation dependence)
│   ├── FramePipeline.kt                 one-frame GPU pipeline (GL-fence handoff; replaced per-frame glFinish)
│   ├── Egl.kt                           state save/restore, matrix conversion
│   ├── Fbo.kt                           FBO + texture allocator
│   ├── GlProgram.kt                     shader compile/link
│   ├── GlDebug.kt                       glGetError logging
│   ├── Shaders.kt                       GLSL source for the Android effects
│   └── ShadersGenerated.kt              codegen'd shader strings (do not edit; bun run build:shaders)
└── segmentation/                      person-segmentation helpers (MediaPipe on Android)
    ├── SegmentationEngine.kt            process-wide worker thread + ImageSegmenter (shared across processors)
    ├── Mask.kt                          GL-side adapter: downsample/readback, EMA, mask-texture upload
    └── MaskTuning.kt                    smoothstep range from a [0,1] hardness factor

ios/KaleidoscopeModule/
├── KaleidoscopeModule.swift           Expo Module entry (mirrors Android)
├── Registration.swift                 flat-string registry: four transform ops + one "composite" processor instance
├── CompositeLayers.swift               the layer stack JS delivers via setCompositeLayers (read per frame)
├── effects/                           the composite processor, the transform processor, and the frame bridge
│   ├── CompositeProcessor.swift         the one "composite" compositor instance; image/direct/blur/generative layers
│   ├── TransformProcessor.swift         flip-x/flip-y/rotate-cw/rotate-ccw (replaced MirrorProcessor.swift)
│   └── FrameBridge.swift                RTCVideoFrame <-> CVPixelBuffer in/out bridge
├── gpu/                               Metal + CoreImage primitives
│   ├── Ingest.swift                     THE one place camera orientation is normalized (display rotation + selfie mirror)
│   ├── Orientation.swift                screen-space transform-op matrices (no frame.rotation dependence)
│   ├── MetalRenderer.swift              pipelines + passes (blur, composite, transform); pixel-buffer pool
│   └── TextureBridge.swift              NV12->BGRA ingest, mask CVPixelBufferPool, Metal texture cache
└── segmentation/                      person-segmentation helpers (MediaPipe Tasks ImageSegmenter on iOS)
    └── Segmenter.swift                  MediaPipe ImageSegmenter worker (selfie_segmenter.tflite); owns mask buffers via a pool

app.plugin.js                          Expo config plugin; standalone CommonJS (no build step, no plugin/ dir)
app.plugin.d.ts                        its ConfigPlugin type
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
mask shader; every layer kind (a blur layer, an image plate, a generative
shader like Simianlights or Nebula) composites through it unchanged.
Per-effect shaders (currently `shaders/blur.frag`, `shaders/transform.frag`)
live as separate files under `shaders/`.

It is **background-source-agnostic**: `mix(background, original, mask)` does
not care whether `uBackground` is a loaded image plate, the blurred camera, or a
generative shader's output; a new layer differs only in how it produces that
texture. Because orientation is normalized upstream at the ingest (see
"Orientation" below), a new shader composites correctly on every platform with
no orientation code; that is the whole extensibility model for generative
layers (issue #25).

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
- An `image` layer samples its WebP plate texture directly; no pre-orient pass.
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

### Where a new generative layer goes

Art effects are not registered per effect. The one registered art processor is
`composite`; a new visual effect is a new LAYER SHADER the compositor can draw,
delivered inside a composite's layer stack via `setCompositeLayers`. Adding one
is data plus a shader, with no `Registration.kt` / `Registration.swift` change:

1. **Spec**: add the shader name and its required fields to `LayerShaderOptions`
   in `src/types.ts` (the closed catalog the `LayerSpec` discriminant narrows
   on). A generative layer takes `uniforms`.
2. **GLSL**: add the canonical `shaders/<name>.frag` and run `bun run
   build:shaders`; the codegen emits the per-platform sources (web
   `*_FRAG_SRC` const, Android, iOS). Do not hand-edit the generated files. (See
   "Where a new GLSL shader goes" for the pipeline; that is its own subsystem.)
3. **Web dispatch**: map the shader name to its generated `*_FRAG_SRC` const in
   `LAYER_SHADER_SOURCES` (`src/web/effects/layer-shaders.ts`). The web
   compositor (`composite.ts`) and the native compositors dispatch on the name;
   no new file per effect.

The only path that still registers a NEW native name is a new GEOMETRIC
transform op (an axis flip or rotation), not an art effect:

- **Spec**: add the name to `TransformName` in `src/types.ts`.
- **Android**: add a `ProcessorProvider.addProcessor("<name>",
  TransformFactory(Orientation.Op.<OP>))` line to `Registration.kt`, with the
  matrix in `Orientation.kt`.
- **iOS**: add a `ProcessorProvider.addProcessor(TransformProcessor(op: .<op>),
  forName: "<name>")` line to `Registration.swift`. Unlike Android (one factory,
  one processor per track), iOS registers a single processor INSTANCE per name
  at boot, so do not skip this; an op with no `Registration.swift` entry is
  silently absent on iOS.

The native side uses a flat-string registry (`ProcessorProvider.addProcessor`)
because the upstream `react-native-webrtc` `_setVideoEffects` API takes
`string[]`. The registry holds only the four transform ops plus `composite`;
per-layer parameters travel out of band through `setCompositeLayers` and the
effect-tuning channel, not through the registry name.

### Where a new image plate goes

A bundled plate is layer DATA, not a registered effect. The one registered art
processor is `composite`; an `image` layer resolves the plate by id at runtime,
so adding a plate needs NO native registration. The flow mirrors
[`images/README.md`](./images/README.md) "Adding a plate":

1. Append the plate name to `BACKGROUND_PRESETS` in `images/presets.ts` (the
   single source of truth).
2. Create `images/<name>/` and drop the optimized `<name>.webp` in it (the
   format/size recipe is in `images/README.md`).
3. Add the loader pair mirroring `dark-office`: `images/<name>/<name>.ts`
   (native, returns the plate id) and `images/<name>/<name>.web.ts` (web,
   returns the WebP URL), both annotated with `PresetSource` from
   `images/preset-source.types.ts`.
4. Add the `./images/<name>` export (with `react-native`, `browser`, `import`,
   `default` conditions) and the `./images/<name>.webp` asset export to the
   package `exports` (Metro has no tree-shaking; consumers import one plate's
   bytes via its subpath).

At `expo prebuild` the config plugin reads the consumer's preset book, finds the
`image` layers it references, and copies just those WebPs into the native bundle
under `assets/images/<id>.webp`. The native side resolves a plate by that id at
runtime; there is no `Registration.kt` / `Registration.swift` line to add. The
type-level autocomplete (`BackgroundPresetName`) picks up the new plate from the
catalog automatically.

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

### Where a consumable control goes (the `./controls` kit)

The tuning editor is a composition kit on the opt-in `./controls` subpath. The
shape, in one breath: a per-layer `ControlForm` micro-provider holds that layer's
view model in a `useReducer`, fields self-wire to it via `useField`, and the form
emits a debounced, trailing-flushed `onPatch({ id, uniforms })` the host routes
into `kaleidoscope(activeId, [patch])`. The Tuner is a dumb, controlled renderer;
it never calls `kaleidoscope` itself.

- **The shared view model is the shader's uniform type.** `ShaderUniformsMap[shader]`
  (e.g. `CloudsUniforms`) is the one contract: the preset bakes values into it, a
  control emits `Partial` of it. A layer's baked `uniforms` is typed against it
  (`LayerShaderOptions[S].uniforms = Partial<ShaderUniformsMap[S]>`), and the
  `kaleidoscope` patch (`PatchFor`) re-indexes the same map by the layer's literal
  `shader`.
- **Built-in path: data-driven.** `<UniformControls controls={CLOUDS_CONTROLS} />`
  renders a shader's `*_CONTROLS` descriptor as fields. No per-shader file. Hide
  knobs by filtering the array; narrow a range with the `overrides` prop.
- **Typed path: `makeControls<U>()`.** For a custom widget, `const { Slider } =
  makeControls<CloudsUniforms>()` constrains the field's `uniform` to `U`'s keys of
  the matching value type (numeric for `Slider`, `RGB` for `ColorPicker`); a typo
  is a compile error.
- **Form ownership.** A composite's `<Composite>Controls` (a sibling
  `composites/<name>/<name>.controls.tsx`, exported as `./composites/<name>/controls`)
  mounts one `ControlForm` per tunable layer, each wrapped in a `ControlSection`
  (title + slot + a web-only copy button). Reset is by **remount** (the Tuner keys
  the controls component by preset id), never an effect. The composite *data*
  module (`<name>.ts`) stays runtime-React-free; the `.controls.tsx` is reached
  only through the `./controls` subpaths, so importing composite data never pulls
  the React kit.
- **Theming.** One `KaleidoscopeThemeProvider` holds a flat slot bank (a
  `<slot>ClassName` + `<slot>Style` pair per primitive and per state). Primitives
  read their slot and merge it after defaults; the `style` path is universal, the
  `className` path rides the `./nativewind` cssInterop registration (only the field
  primitives are registered; the parity test scopes "styleable" to them). Pass a
  memoized provider value (this package is off the React Compiler).
- **Copy is web-only.** The `ControlSection` copy button renders only when
  `Platform.OS === 'web'` and writes via `navigator.clipboard`; the package depends
  on no clipboard module.
- **Import direction (one-way).** `./controls` must never import from `./ui`. The
  only allowed cross-edge is `./ui` importing the theme context from
  `./controls/theme` (a leaf module that imports nothing from its siblings).

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
- **Codegen sync of the image-plate catalog to native.** Moot under the
  unified model: plates are not registered names. The catalog lives in TS
  (`images/presets.ts`); the prebuild plugin copies only the plates a consumer's
  book references, and the native side resolves them by id at runtime, so there
  is nothing for Kotlin or Swift to mirror.
