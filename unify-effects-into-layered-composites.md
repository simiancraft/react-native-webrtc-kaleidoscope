# Unify Every Effect Into One Layered Composite

**Status:** Draft
**Scope:** cross-stack
**Date:** 2026-06-01
**Last reviewed:** 2026-06-01
**Context:** The library carries two effect shapes (a single-shader path and a multi-layer scene path) plus a per-effect native factory per preset; all of it is on one unreleased branch with no consumers, so it can be collapsed to one shape now instead of carried forever.

## Goal

Today an effect is either a single shader (`{ shader, options }`) or a scene (`{ shader: 'scene', layers }`), and natively each preset registers its own factory (`background-image-<id>`, `blur`, the generic shader, `scene`). That fork is dead weight: scenes already prove a layered compositor works on web and Android. We collapse every effect into one **Composite** (an ordered layer stack), run by one native **composite** compositor, commanded by the three-verb surface (`kaleidoscope` / `transform` / `mask`). Done looks like: every book entry is a `Composite` (`{ name, category, thumbnail?, layers }`); each layer carries an `id`; `kaleidoscope(presetId, patches?)` selects a preset and merges per-layer uniform patches (live, no rebuild, when patching the active preset); the singleton specs, the per-effect native factories, and the public `applyVideoEffects` are gone; the demo is a category menu plus a thumbnail rail plus procedurally generated sliders; web and Android are green, iOS last.

## Domain context

- **Composite** — the value type: `{ name: string; category: string; thumbnail?: <source>; layers: LayerSpec[] }`. The book is `Record<string, Composite>`; one `string → Composite` entry is a **preset**. `Preset = { id: string } & Composite` is the materialized entry the picker/tuner iterate.
- **Layer** — `{ id; shader; target?; blend?; source?; uniforms? }`. `id` is unique **within a preset** (plain numbering is fine). `shader` is the discriminant; `target` is `'background'` (fullscreen) or `'subject'` (mask-stenciled), default `'background'`; `blend` is `'normal'` (premultiplied over) or `'additive'`. Declaration order is paint order (back to front).
- **The two channels.** One camera feed; the compositor can address the whole frame or the mask-stenciled subject. A layer's shader is either **camera-sampling** (`direct`, `blur`) or **content-generating** (`image`, `clouds`, `plasma`, …). `target` decides the stencil for either kind. `direct` is a passthrough of its channel (subject = the masked person; background = the raw camera fullscreen).
- **LayerPatch** — `{ id; shader; uniforms: Partial<that shader's uniforms> }`. Addresses a layer by `id`, carries `shader` only to drive uniform-type narrowing (IntelliSense); the runtime resolves by `id` and **merges** the partial uniforms over the layer's baked values.
- **Rebuild-aware command.** `kaleidoscope(presetId, patches?)`: switching to a different preset rebuilds the pipeline (web yields a new track via `onTrack`); patching the **currently active** preset routes through the live no-rebuild uniform channel (like `mask`), so sliders stay smooth.

## Current surface area

| File | Role | Change |
|------|------|--------|
| `src/types.ts` | `EffectSpec` union, `LayerSpec`, `SceneSpec` | Collapse union to `CompositeSpec \| TransformSpec`; `LayerSpec.id` required; add `LayerPatch`; delete `BlurSpec`/`BackgroundImageSpec`/`ShaderSpec` |
| `src/kaleidoscope/types.ts` | `Preset`/`Scene`/`BookEntry`/`ShaderOptionsMap`/`PresetBook`/command types | Replace with `Composite`/`Preset`/`PresetBook = Record<string, Composite>`; command gains `patches?` |
| `src/kaleidoscope/shader-to-spec.ts` | `presetToEffectSpec` | Replace with `compositeToEffectSpec` (every entry → one `CompositeSpec`) |
| `src/kaleidoscope/controls.ts` | composite-state machine | Rebuild-aware `kaleidoscope`; route active-preset patches through the live channel |
| `src/index.ts` | native facade, `serializeSceneLayers`, exports | `composite` wire name + layer `id`s; un-export `applyVideoEffects`; live channel re-keyed to layer id |
| `src/index.web.ts` | web facade, `specToTransform`, `applyVideoEffects` | `specToTransform` reduces to `composite` + transforms; `applyVideoEffects` internal |
| `src/web/effects/scene.ts` | `makeScene` compositor + `setLayerUniforms` | Generalize: blur layer, `direct/background`, subject-stencil for any layer; live channel keyed by layer id |
| `src/web/effects/{blur,background-image,shader-effect}.ts` | standalone web effects | Fold into `makeScene`; delete |
| `src/shaders/blur.ts` | (new) | `BlurUniforms` + `BLUR_CONTROLS` (`sigma`) |
| `src/shaders/index.ts` | `LAYER_CONTROLS` | Add `blur` |
| `android/.../effects/SceneFactory.kt` | GL compositor | Generalize (blur layer, subject-stencil, `direct/background`); rename to composite |
| `android/.../effects/{BackgroundImage,Shader,Blur}Factory.kt` | per-effect factories | Delete (fold into compositor) |
| `android/.../effects/LayerShaders.kt` | layer GLSL | Add blur layer shader |
| `android/.../Registration.kt` | registry | Register only `composite` (art) + transforms |
| `android/.../SceneLayers.kt` | wire parser | Layer `id` field |
| `ios/KaleidoscopeModule/effects/SceneProcessor.swift` + `gpu/SceneCompositing.swift` | Metal compositor | Mirror Android generalization |
| `ios/KaleidoscopeModule/effects/{BackgroundImage,Shader,Blur}Processor.swift` | per-effect processors | Delete |
| `ios/KaleidoscopeModule/{Registration,SceneLayers}.swift` | registry, parser | `composite` name; layer `id` |
| `demo/kaleidoscope.presets.ts` | the book | Convert every entry to a `Composite` (ids, `name`, `category`) |
| `demo/app/index.tsx` | demo screen | Category menu + thumbnail rail + procedural sliders via patches |
| `demo/src/layer-controls.tsx` | slider panel | Re-key to layer id; emit `LayerPatch`es |
| `src/ui/picker/*` | `KaleidoscopePicker` | Group by `category` |
| `test/plugin.test.ts`, `android/.../SceneLayersTest.kt`, `ios-tests/.../SceneLayersTests.swift` | tests | Layer `id`; `composite` wire name |
| `README.md` | docs | Rewrite around the unified shape |

## File structure: after

**Legend:** `+` added `−` deleted `~` rewritten

```
src/
├── shaders/
│   ├── blur.ts                 + BlurUniforms + BLUR_CONTROLS (sigma)
│   └── index.ts                ~ LAYER_CONTROLS += blur
├── web/effects/
│   ├── scene.ts                ~ blur layer, direct/background, subject-stencil for any layer
│   ├── blur.ts                 − folded into scene.ts (gaussian kernel)
│   ├── background-image.ts     − folded into scene.ts (image layer)
│   └── shader-effect.ts        − folded into scene.ts (generative layer)
├── kaleidoscope/{types,controls,shader-to-spec}.ts   ~ Composite vocabulary + patches
├── types.ts                    ~ collapse EffectSpec union; LayerSpec.id; LayerPatch
├── index.ts                    ~ composite wire name; applyVideoEffects internal
└── index.web.ts                ~ specToTransform → composite + transforms

android/src/main/java/com/simiancraft/kaleidoscope/
├── effects/
│   ├── SceneFactory.kt          ~ generalized compositor (registered "composite")
│   ├── LayerShaders.kt          ~ + blur layer GLSL
│   ├── BackgroundImageFactory.kt − fold into compositor
│   ├── ShaderFactory.kt          − fold into compositor
│   └── BlurFactory.kt            − fold into compositor (kernel → LayerShaders)
├── Registration.kt              ~ register composite + transforms only
└── SceneLayers.kt               ~ SceneLayer.id

ios/KaleidoscopeModule/
├── effects/
│   ├── SceneProcessor.swift          ~ generalized compositor
│   ├── BackgroundImageProcessor.swift − delete
│   ├── ShaderProcessor.swift          − delete
│   └── BlurProcessor.swift            − delete
├── gpu/SceneCompositing.swift        ~ blur + masked-composite pipelines
├── shaders/scene-blur.metalsrc       + camera-sampling blur layer
├── Registration.swift                ~ register composite + transforms only
└── SceneLayers.swift                 ~ SceneLayer.id

demo/
├── kaleidoscope.presets.ts     ~ every entry → Composite (id/name/category)
├── app/index.tsx               ~ category menu + thumbnail rail + procedural sliders
└── src/layer-controls.tsx      ~ emit LayerPatch by layer id
```

## Commits

### Phase A — Web, types, demo (the working state for web testing)

#### Commit A1: Generalize the web compositor

**Goal:** `makeScene` gains the three missing capabilities, additively (existing scenes keep rendering).

**Files created:**
- `src/shaders/blur.ts`: `BlurUniforms = { sigma }` + `BLUR_CONTROLS` (one `sigma` float control, range [0.5, 7]).

**Files rewritten:**
- `src/web/effects/scene.ts`: add a `blur` layer (camera-sampling, separable two-pass, folding the gaussian from `blur.ts`); make `direct` + `target: 'background'` draw the raw camera fullscreen; render any subject-targeted layer to a scratch texture, then a masked-composite multiplies by mask alpha and blends (so generative/blur/image can target `subject`, not just `direct`).
- `src/shaders/index.ts`: `LAYER_CONTROLS.blur = BLUR_CONTROLS`.

**Gate:** `bun run check` passes; existing scene presets still render in the web demo.

#### Commit A2: Flip the type vocabulary and route every effect through the composite

**Goal:** One art spec (the layered composite); collapse the singleton specs and the per-effect web stages.

**Files rewritten:**
- `src/types.ts`: `LayerSpec.id` required; add `LayerPatch`; `SceneSpec` → `CompositeSpec` (`name: 'composite'`); `EffectSpec = CompositeSpec | TransformSpec`; delete `BlurSpec`/`BackgroundImageSpec`/`ShaderSpec`.
- `src/kaleidoscope/types.ts`: `Composite`, `Preset = { id } & Composite`, `PresetBook = Readonly<Record<string, Composite>>`; `KaleidoscopeCommand` gains `patches?: LayerPatch[]`; delete old `Preset`/`Scene`/`BookEntry`/`ShaderOptionsMap`.
- `src/kaleidoscope/shader-to-spec.ts`: replace `presetToEffectSpec` with `compositeToEffectSpec` (a `Composite` → `{ name: 'composite', layers }`).
- `src/kaleidoscope/controls.ts`: rebuild-aware `kaleidoscope` (track active preset id; same id + patches → live channel; different id → rebuild).
- `src/index.web.ts`: `specToTransform` handles `composite` + the four transforms only; delete the `blur`/`background-image`/`shader` cases; un-export `applyVideoEffects` (keep `applyVideoEffectsDisposable` internal for the LiveKit adapter); fix the type re-exports.
- `src/index.ts`: `serializeSceneLayers` emits the `composite` shape with per-layer `id`; `specToNativeName` returns `'composite'`; live channel re-keyed to layer id; drop the old singleton exports.

**Files deleted:**
- `src/web/effects/background-image.ts`, `src/web/effects/shader-effect.ts`, `src/web/effects/blur.ts` (folded into `scene.ts` in A1).

**Files rewritten (demo, to keep green):**
- `demo/kaleidoscope.presets.ts`: every entry becomes a `Composite` — image presets become a one-layer `image` composite, blur presets become `[{ blur, background }, { direct, subject }]`, plasma presets become a one-layer generative composite, scenes drop the `shader: 'scene'` wrapper; every layer gets an `id`; each entry gets `name` + `category`.
- `demo/app/index.tsx`: minimal edits to compile against the new book/verb (full reorg is A3).

**Gate:** `bun run check` passes; web demo renders every category (backgrounds, blur, plasma, sky, worlds) with masking.

#### Commit A3: Reorganize the demo (category menu, thumbnail rail, procedural sliders)

**Goal:** The demo screen is a category menu (Worlds first) → a thumbnail/button rail → procedurally generated sliders that emit layer-id patches; transform and mask unchanged.

**Files rewritten:**
- `demo/app/index.tsx`: left category menu from the book's `category` values; selecting a category marches its presets along the top (thumbnail if present, else a labeled button); selecting a preset seeds the sliders.
- `demo/src/layer-controls.tsx`: iterate the active preset's tunable layers by `id`, render one panel per layer from `LAYER_CONTROLS[layer.shader]`, emit `LayerPatch`es via `kaleidoscope(activeId, [patch])`.
- `src/ui/picker/*`: `KaleidoscopePicker` groups tiles by `category`.

**Gate:** `bun run check` passes; manual web pass: each category lists, thumbnails/buttons select, sliders tune live (no flicker), blur/scenes/mask/transform all work.

#### Commit A4: Reconcile the JS tests to the new shape

**Goal:** Tests assert the `composite` wire shape and per-layer `id`s.

**Files rewritten:**
- `test/plugin.test.ts` and any serialization tests: `composite` name, layer `id`s, the patch merge.

**Gate:** `bun test` passes; `bun run check` green.

### Phase B — Android (the working state for Android testing)

#### Commit B1: Generalize the Android compositor

**Files rewritten:**
- `android/.../effects/SceneFactory.kt`: blur layer (scratch + masked-composite path), `direct/background` draws the camera, subject-stencil for any layer.
- `android/.../effects/LayerShaders.kt`: add the blur layer GLSL (kernel from `BlurFactory`).

**Gate:** `check:android` (`compileDebugKotlin`) passes.

#### Commit B2: Collapse the Android registry to one composite

**Files rewritten:**
- `android/.../Registration.kt`: register `composite` (art) + the four transforms only.
- `android/.../SceneFactory.kt`: registered name `composite`.
- `android/.../SceneLayers.kt`: `SceneLayer.id`.

**Files deleted:**
- `android/.../effects/BackgroundImageFactory.kt`, `ShaderFactory.kt`, `BlurFactory.kt`.

**Gate:** `check:android` passes.

#### Commit B3: Update the Android parser test

**Files rewritten:**
- `android/.../SceneLayersTest.kt`: per-layer `id`.

**Gate:** `:react-native-webrtc-kaleidoscope:testDebugUnitTest` passes.

#### Commit B4: Verify on the Android emulator

**Goal:** Drive every category on the harness emulator; confirm compositing with the man and the mask.

**Gate:** Harness run green (logcat clean; screenshots show each category compositing).

### Phase C — iOS (last)

#### Commit C1: Generalize the iOS compositor

**Files created:**
- `ios/KaleidoscopeModule/shaders/scene-blur.metalsrc`: camera-sampling blur layer.

**Files rewritten:**
- `ios/.../effects/SceneProcessor.swift`, `gpu/SceneCompositing.swift`: blur layer, `direct/background`, subject-stencil for any layer (scratch + masked-composite pipeline).

**Gate:** `bun run check` (JS parity) passes; EAS iOS build compiles.

#### Commit C2: Collapse the iOS registry and parser

**Files rewritten:**
- `ios/.../Registration.swift`: register `composite` + transforms only.
- `ios/.../SceneLayers.swift`: `SceneLayer.id`.
- `ios-tests/.../SceneLayersTests.swift`: per-layer `id`.

**Files deleted:**
- `ios/.../effects/BackgroundImageProcessor.swift`, `ShaderProcessor.swift`, `BlurProcessor.swift`.

**Gate:** EAS iOS build compiles; device smoke pass.

### Phase D — Docs

#### Commit D1: Rewrite the README around the unified shape

**Files rewritten:**
- `README.md`: the `Composite` book, the three verbs, layer ids and patches; drop the singleton-spec and `applyVideoEffects` framing.

**Gate:** `bun run check` passes; link check clean.

#### Commit D2: Delete this plan

- Delete `unify-effects-into-layered-composites.md`.
- If any convention is worth keeping (the Composite vocabulary), fold a short note into the README first.

**Gate:** `bun run check` passes; repo contains no references to the plan file.

## Verification checklist

- [ ] Every book entry is a `Composite`; no `shader: 'scene'` discriminant remains.
- [ ] Every layer has a unique-per-preset `id`; `LayerPatch` merges partial uniforms.
- [ ] `kaleidoscope` / `transform` / `mask` are the only public verbs; `applyVideoEffects` is not exported.
- [ ] One native effect (`composite`) for art; the per-effect art factories/processors are deleted on both platforms.
- [ ] Blur is a camera-sampling layer; `direct/background` draws the camera; any layer can target `subject`.
- [ ] Demo: category menu (Worlds first), thumbnail/button rail, procedural sliders emitting patches; transform + mask unchanged.
- [ ] `bun run check` green; Android `testDebugUnitTest` green; emulator pass; EAS iOS build compiles.
- [ ] README rewritten.
- [ ] Plan file deleted (Inspector Gadget Rule: no orphan plans).

## References

- `kaleidoscope-command-and-preset-registry.md` — the v3 command/registry plan this supersedes the singleton half of.
- `src/web/effects/scene.ts` — the canonical compositor semantics to mirror on native.
