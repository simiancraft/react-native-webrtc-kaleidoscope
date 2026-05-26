# Kaleidoscope Command and Shader-Preset Registry

**Status:** Draft
**Scope:** cross-stack
**Date:** 2026-05-26
**Last reviewed:** 2026-05-26
**Context:** The library's effects are driven by an `applyVideoEffects(track, effects[])` array plus a scatter of global tuning setters and per-preset native factories; this is the slider-heavy, all-or-nothing surface v3 must replace before downstream libraries integrate, to avoid churning them later.

## Goal

Today effects are an array of names, parameters are dropped at the bridge (`src/index.ts:174`) and faked with global setters, and every preset is its own native factory. We are unifying the entire effect surface behind one verb, `kaleidoscope()`, fed by a consumer-curated preset book where every entry is `{ name, shader, options }` and every effect (blur, background image, plasma) is a *shader*. Done looks like: a consumer declares presets in their project, a prebuild mod copies only the referenced shader/image sources into the native bundle, native discovers and registers one engine per source, per-preset args ride a real parameter channel to the GPU on all three platforms, the pipeline runs `normalize → art → transform` so geometry and background compose correctly, and the demo drives everything through `kaleidoscope()` as two single-select radio banks with no sliders.

## Build progress (web-first)

Built in vertical slices, web first (the live demo is the proof surface), not strict phase order:

- ✅ **Parameter channel** (blur sigma) over the existing tuning side-channel (Commit 1).
- ✅ **plasma.frag** specimen + iOS transpile (Commit 5); **web plasma processor** + web codegen (Commit 6).
- ✅ **Three-phase order on web**: art-first / transform-last, enforced via the demo's apply order; fixes the segment-the-rotated-frame bug.
- ✅ **Shader contracts + typed command union** (`src/kaleidoscope/types.ts`; Commit 9) and **`kaleidoscope()` + session over a preset book** (Commit 13). Demo drives the command over `demo/kaleidoscope.presets.ts`. Verified on web (plasma composites, art+transform compose, no runtime errors).

Remaining: **Commit 14** (remove the public tuning setters; the debug panel still uses them); **native plasma** (Android/iOS processor + generalizing the parameter channel to arbitrary uniforms, e.g. `setShaderUniforms`); **native three-phase reorder** (Phase B 3/4); **the precompiler** (Phase E: latent folder, `app.plugin.js` resolve-and-copy, directory-discovery registration) — native-only, the largest unretired risk; demo custom image (Commit 15); README/migration (Commit 17).

## Domain context

- **Three-phase pipeline.** Every frame runs `normalize` (upright, platform-consistent image) → `art` (segmentation + background treatment, runs on the *normalized* frame so the person mask lands correctly) → `transform` (flip/rotate, applied **last**, in display space). Two independently composable axes the consumer selects from: **art** and **transform**.
- **Shader = base engine; preset = patch.** The synth model. A *shader* is a fixed, library-owned background generator plus its uniform contract. A *preset* is a named, frozen bundle of options over one shader (`{ name: 'plasma-ocean', shader: 'plasma', options: { colorA, colorB, speed } }`). One shader source fans out into many named presets. Consumers add presets (and the assets they point at), never shaders.
- **Background generators, shared compositor.** `blur`, `background-image`, and `plasma` differ only in *how the background is generated* (from the camera, from a file, from `uTime`). Compositing the person over that background through the mask is the shared, fixed tail of the art phase, not a selectable thing.
- **Parameter channel.** The numeric args of a preset (`sigma`, `speed`, colors) must physically cross the rn-webrtc bridge to the GPU at runtime. This is the foundation everything rests on; it is currently absent (args are dropped at the bridge).
- **Axis inferred from shader.** Each shader declares its axis (`art` | `transform`) once. A command names a preset; the library reads the preset's shader, infers the axis, and replaces only that axis. `cmd` is a discriminated union of shader names widened to the consumer's preset ids, generic over the `as const` book, so `options` is typed per shader and patch ids autocomplete.

## Current surface area

| File | Role | Change |
|------|------|--------|
| `src/index.ts` | Native entry: `applyVideoEffects`, tuning setters; bridge drops args (`:174-176`) | Add param channel; add `kaleidoscope()`; remove headline setters |
| `src/index.web.ts` | Web entry: same surface over `src/web/tuning.ts` | Mirror native; per-effect args replace global tuning |
| `src/types.ts` | `EffectSpec`, `EffectInput`, `ApplyVideoEffects` | Add preset/shader/options types + discriminated union |
| `src/web/effects/background-image.ts` | Web image compositor | Reframe as `background-image` shader; read args |
| `src/web/tuning.ts` | Web global tuning object | Demote to internal per-platform constants + debug |
| `src/web/shaders.generated.ts` | Codegen'd web shader strings | Add plasma; add generic shader runner |
| `src/backgrounds/presets.ts` + `*.ts`/`*.web.ts`/`*.webp` | 11 preset sources, per-platform split | Move webp to latent folder; keep web subpath exports |
| `shaders/blur.frag`, `composite.frag`, `transform.frag`, `passthrough.vert` | Active shaders | Reframe blur/transform as shaders w/ contracts |
| `shaders/nebula.frag`, `simianlights.frag` | Orphaned (issue #25) | Stay orphaned; plasma is the specimen |
| `scripts/build-shaders.ts` | Codegen Android `.kt` / web `.ts`, transpile iOS `.metalsrc` | Add plasma + generic runner; gate stays |
| `android/.../Registration.kt` | Hardcoded factory list | Switch to directory discovery |
| `ios/KaleidoscopeModule/Registration.swift` | Hardcoded processor list | Switch to directory discovery |
| `android/src/main/assets/backgrounds/` | Auto-bundled webp (11) | Empty; populated by prebuild mod |
| `ios/KaleidoscopeModule/resources/backgrounds/` | Auto-bundled webp (11) | Empty; populated by prebuild mod |
| `app.plugin.js` | iOS modular-headers + deployment-target mods | Add resolve-and-copy mod for preset book |
| `package.json` | exports map; `build`, `build:shaders`, `check:shaders` | Add shader subpath exports; latent-folder copy |
| `demo/app/index.tsx` | Toggle grid + slider panel | Two radio banks; drive via `kaleidoscope()` |
| `demo/src/effect-tuning-panel.tsx` | Sliders | Delete (debug overlay only) |
| `demo/src/effect-toggles.tsx` | Toggle buttons | Replace with radio-bank tiles |

## File structure: before

**Legend:** `+` created · `~` modified · `🔀` moved/renamed · `-` deleted · `🪓` split source

```
react-native-webrtc-kaleidoscope/
├── shaders/
│   ├── blur.frag
│   ├── composite.frag
│   ├── transform.frag
│   ├── passthrough.vert
│   ├── nebula.frag            // orphaned
│   └── simianlights.frag      // orphaned
├── src/
│   ├── index.ts
│   ├── index.web.ts
│   ├── types.ts
│   ├── backgrounds/
│   │   ├── presets.ts
│   │   ├── dark-office.ts
│   │   ├── dark-office.web.ts
│   │   ├── dark-office.webp
│   │   └── … (11 presets × 3)
│   └── web/
│       ├── tuning.ts
│       ├── shaders.generated.ts
│       └── effects/background-image.ts
├── android/src/main/
│   ├── assets/backgrounds/*.webp        // 11, auto-bundled
│   └── java/com/simiancraft/kaleidoscope/
│       ├── Registration.kt
│       └── gpu/ShadersGenerated.kt
├── ios/KaleidoscopeModule/
│   ├── Registration.swift
│   ├── resources/backgrounds/*.webp     // 11, auto-bundled
│   └── shaders/*.metalsrc
├── scripts/build-shaders.ts
├── app.plugin.js
├── package.json
└── demo/
    ├── app/index.tsx
    └── src/
        ├── effect-tuning-panel.tsx
        └── effect-toggles.tsx
```

## File structure: after

**Legend:** `+` created · `~` modified · `🔀` moved/renamed · `-` deleted

```
react-native-webrtc-kaleidoscope/
├── shaders/
│   ├── blur.frag                        ~ declares axis:art via contract
│   ├── composite.frag
│   ├── transform.frag                   ~ axis:transform
│   ├── passthrough.vert
│   ├── plasma.frag                      + two-color time-morph specimen
│   ├── nebula.frag
│   └── simianlights.frag
├── src/
│   ├── index.ts                         ~ + kaleidoscope(), param channel; − setters
│   ├── index.web.ts                     ~ mirror
│   ├── types.ts                         ~ + Preset, ShaderName, ShaderOptionsMap, command union
│   ├── kaleidoscope/                    +
│   │   ├── session.ts                   + singleton: composite state, onTrack, getTrack
│   │   ├── dispatch.ts                  + preset→{shader,args}, axis inference
│   │   └── shaders/                     + hand-authored contracts (issue: codegen later)
│   │       ├── blur.options.ts          + { sigma } ; axis art
│   │       ├── background-image.options.ts + { source } ; axis art
│   │       ├── plasma.options.ts        + { colorA, colorB?, speed?, scale? } ; axis art
│   │       └── transform.options.ts     + { op } ; axis transform
│   ├── assets-latent/                   + 🔀 from src/backgrounds + shaders (neutral, not auto-bundled)
│   │   ├── backgrounds/*.webp           🔀
│   │   └── shaders/*.frag               🔀 copied at build for resolve
│   ├── backgrounds/
│   │   ├── presets.ts                   ~ point at latent folder; web subpath exports kept
│   │   └── *.web.ts                     ~
│   └── web/
│       ├── tuning.ts                    ~ internal per-platform constants + debug only
│       ├── shaders.generated.ts         ~ + plasma + generic runner
│       └── effects/
│           ├── background-image.ts      ~ reframed as shader; reads args
│           └── shader-processor.ts      + generic generative-shader runner (web)
├── android/src/main/
│   ├── assets/backgrounds/              ~ empty; populated by prebuild mod
│   ├── assets/shaders/                  + populated by prebuild mod
│   └── java/com/simiancraft/kaleidoscope/
│       ├── Registration.kt              ~ directory discovery
│       ├── gpu/ShadersGenerated.kt      ~ + plasma
│       └── gpu/ShaderProcessor.kt       + generic generative-shader runner
├── ios/KaleidoscopeModule/
│   ├── Registration.swift               ~ directory discovery
│   ├── ShaderProcessor.swift            + generic generative-shader runner
│   ├── resources/                       ~ empty; populated by prebuild mod
│   └── shaders/plasma.metalsrc          + transpiled
├── scripts/build-shaders.ts             ~ + plasma + generic runner; gate extends
├── app.plugin.js                        ~ + resolve-and-copy preset-book mod
├── package.json                         ~ + shader subpath exports; latent copy in build
└── demo/
    ├── assets/backgrounds/acme-lobby.webp + demo-owned custom image (proves consumer-asset path)
    ├── kaleidoscope.presets.ts          + the consumer preset book (manual v1)
    ├── app/index.tsx                    ~ two radio banks; kaleidoscope() + onTrack
    └── src/
        ├── art-bank.tsx                 + single-select tile bank (blur/image/plasma presets)
        ├── transform-bank.tsx           + single-select transform buttons
        ├── debug-overlay.tsx            🔀 from effect-tuning-panel.tsx (debug exports only)
        ├── effect-tuning-panel.tsx      - sliders gone
        └── effect-toggles.tsx           -
```

## Commits

Ordered for technical correctness: nothing breaks between commits. The parameter channel comes first because every later phase depends on args reaching the GPU.

### Phase A — Parameter channel (foundation)

#### ✅ Commit 1: Route per-spec blur sigma through the tuning channel

**Goal:** Productize the parameter channel; the riskiest unknown, de-risked first.

**Finding that reshaped this commit:** the parameter channel is not absent. The Expo Module tuning functions (`setBlurSigma`, etc.) + `EffectTuning` already side-channel the registry, and the per-frame processors read it every frame (`KaleidoscopeModule.kt:9-10`). Upstream's `_setVideoEffects(names)` has no argument slot, so this channel *is* the parameter path. The single-active-art-axis model makes a shared value correct (only one blur is ever active), so no per-instance native plumbing was needed.

**Files rewritten:**
- `src/types.ts`: `BlurSpec` gains optional `sigma`.
- `src/index.ts`: the native facade routes a blur spec's `sigma` through `nativeModule().setBlurSigma` before applying; no native code change (the existing channel consumes it).
- `src/index.web.ts`: the web facade routes `sigma` through `tuning.setBlurSigma`.

**Gate:** `bun run check` and `bun run check:shaders` green. (Native is the existing proven channel; web is locally testable.)

### Phase B — Three-phase pipeline reorder

#### Commit 2: Enforce `normalize → art → transform` on web

**Goal:** Segmentation runs on the upright normalized frame; transform applied last in display space; art + transform compose.

**Files rewritten:**
- `src/web/` pipeline assembly: order phases explicitly; segmentation input is the normalized frame; transform is the final display-space step.

**Gate:** `bun run build` passes; web demo shows a background replacement with `flip-x` active and the mask still lands on the silhouette (not mirrored-wrong).

#### Commits 3, 4: Reorder Android and iOS (same shape)

Each follows Commit 2's intent on the native pipeline: `Registration`/processor wiring runs `transform.frag` strictly last, after segmentation+art on the normalized frame. `android/.../gpu/*` (Commit 3), `ios/KaleidoscopeModule/*` (Commit 4). Separate commits, each gated by a native build where background + transform compose with the mask correct.

**Gate (phase boundary):** all checks pass; on each platform, an art preset + a transform compose with the mask correctly placed.

### Phase C — Generic shader processor + plasma specimen

#### ✅ Commit 5: Author `plasma.frag` (iOS-transpiled)

**Goal:** The specimen exists in canonical source and transpiles to Metal.

**Files created:**
- `shaders/plasma.frag`: full-frame two-color time-morph. Uniforms `uTime` (float), `uResolution` (vec2), `uColorA`/`uColorB` (vec3), `uSpeed`/`uScale` (float). Bounded cost: a small sum of sines, no loops/noise. Reads `uTime`, ignores the input frame (generative).
- `ios/.../shaders/plasma.metalsrc` + updated `SHADERS.txt` (generated by `build:shaders`; iOS auto-transpiles every shader).

**Adjustment:** the Android/web codegen lists (`ANDROID_CODEGEN`/`WEB_CODEGEN` in `scripts/build-shaders.ts`) are NOT touched here. Adding `PLASMA_FRAG_SRC` without a consumer would fail `knip` (unused export); the web/Android consts are added in Commits 6/7 alongside the processor that imports them. Until then plasma is staged exactly like nebula/simianlights (iOS-transpiled, ungated).

**Gate:** `bun run build:shaders` transpiles plasma (six uniforms survive spirv-opt with buffer bindings); `bun run check:shaders` green.

#### ✅ Commit 6: Plasma runs on web (+ demo hook)

**Goal:** Render plasma into the composite's background slot, fed a host `uTime` clock + uniforms, matted through the mask. Web first (the proof surface).

**Files created:**
- `src/web/effects/plasma.ts`: renders `PLASMA_FRAG_SRC` into a background FBO each frame (host monotonic `uTime`, `uColorA/uColorB/uSpeed/uScale`), composites via `COMPOSITE_FRAG_SRC` (same path as background-image). Written concretely for plasma; the generic runner waits for the second shader.

**Files rewritten:**
- `scripts/build-shaders.ts`: `plasma.frag` added to `WEB_CODEGEN` (consumer exists, so knip stays green); Android codegen still untouched.
- `src/types.ts`: `PlasmaSpec` + `RGB` join the effect union.
- `src/index.web.ts`: `specToTransform` builds plasma; `src/index.ts`: plasma name filtered until native lands.
- `src/web/shaders.ts`: re-export `PLASMA_FRAG_SRC`.
- `demo/app/index.tsx`: a "Shaders" section with four plasma presets, wired through the existing toggle UI (interim, pre single-select rewrite).

**Gate:** `bun run build`, `typecheck`, `typecheck:demo`, `lint`, `knip`, `check:shaders` green. Visual confirmation (plasma animates behind the silhouette) pending a web test on a real camera.

#### Commits 7, 8: Generic processor on Android and iOS (same shape)

Each ports Commit 6's contract: `android/.../gpu/ShaderProcessor.kt` (Commit 7), `ios/KaleidoscopeModule/ShaderProcessor.swift` (Commit 8). A per-frame time uniform host feeds the shader; uniform args arrive over the Commit 1 channel. Separate commits, each gated by a native build where plasma animates and composites and a live arg change is visible.

**Gate (phase boundary):** all checks pass; plasma animates and composites on all three platforms.

### Phase D — Reframe effects as shaders; author contracts

#### Commit 9: Shader option contracts + the typed command union

**Goal:** Every effect is a shader with a hand-authored option contract; `blur`/`background-image` keep their existing engines but are addressed as shaders. Axis declared per shader. (Generating these contracts from the shader source is deferred; see References.)

**Files created:**
- `src/kaleidoscope/shaders/blur.options.ts`: `{ sigma: number }`, axis `art`.
- `src/kaleidoscope/shaders/background-image.options.ts`: `{ source: PresetSource }`, axis `art`.
- `src/kaleidoscope/shaders/plasma.options.ts`: `{ colorA: RGB; colorB?: RGB; speed?: number; scale?: number }`, axis `art`.
- `src/kaleidoscope/shaders/transform.options.ts`: `{ op: 'flip-x'|'flip-y'|'rotate-cw'|'rotate-ccw' }`, axis `transform`.

**Files rewritten:**
- `src/types.ts`: `ShaderName`, `ShaderOptionsMap` (closed union assembled from the contracts), `Preset<S>` = `{ name: string; shader: S; options: ShaderOptionsMap[S] }`, and the command discriminated union (cmd = shader name widened to preset ids; opts typed per shader).

**Gate:** `bun run build` passes; type test: a preset with wrong options for its `shader` fails to compile; correct one infers `options`.

### Phase E — Latent assets, prebuild copy, directory discovery

#### Commit 10: Move preset assets to a latent folder

**Goal:** No preset reaches a native bundle automatically; web subpath exports preserved.

**Files moved/renamed:**
- `src/assets-latent/backgrounds/*.webp ← src/backgrounds/*.webp`
- `src/assets-latent/shaders/*.frag ← shaders/*.frag` (build-time copy for resolution; canonical source stays in `shaders/`).

**Files rewritten:**
- `android/src/main/assets/backgrounds/` and `ios/KaleidoscopeModule/resources/backgrounds/`: emptied (remove from auto-bundled locations / `resource_bundles` glob).
- `package.json`: add shader subpath exports; copy latent assets in `build`; keep per-preset webp subpath exports for web.

**Gate:** `bun run build` passes; `require.resolve('react-native-webrtc-kaleidoscope/shaders/plasma.frag', { paths: [demoRoot] })` resolves; native builds contain no preset assets yet.

#### Commit 11: Resolve-and-copy prebuild mod in `app.plugin.js`

**Goal:** At `expo prebuild`, statically parse the consumer preset book, resolve referenced shader sources (by `shader` name → catalog) and option-embedded image `require(...)` specifiers, copy only those into native locations, idempotently, deduped by resolved source path.

**Files rewritten:**
- `app.plugin.js`: read the convention-path preset book as text; static-parse (no execution) shader names + image specifiers; resolve (library via `require.resolve(..., { paths: [projectRoot] })`, consumer via `path.resolve`); copy (Android `withDangerousMod`; iOS `withDangerousMod` + `withXcodeProject.addResourceFile`); load mods API via project-root resolve; idempotent; unresolved specifier throws clearly.

**Gate:** `bun run build` passes; `expo prebuild` in the demo copies exactly the referenced shader/image sources into `android/app/src/main/assets/{backgrounds,shaders}` and the iOS app target's Copy Bundle Resources; re-prebuild is a no-op.

#### Commit 12: Directory-discovery registration

**Goal:** Native enumerates the copied `backgrounds/`+`shaders/` dirs at `OnCreate`, registering one engine per unique source (dedicated engine for `blur`/`background-image`, generic processor for `plasma`/future shaders); built-in `transform` registered too. No hardcoded preset lists.

**Files rewritten:**
- `android/.../Registration.kt`, `ios/KaleidoscopeModule/Registration.swift`: directory discovery; map source → engine; iOS loaders search the bundle the resources landed in.

**Gate:** all checks pass; a fresh `expo prebuild` + native build registers exactly the demo's curated sources; an unreferenced preset is absent.

### Phase F — Unified registry + `kaleidoscope()` command

#### Commit 13: The `kaleidoscope()` verb and singleton session

**Goal:** One overloaded function. Bind: `kaleidoscope(track, { presets, onTrack })`. Command: `kaleidoscope({ cmd, opts? })` sets the axis inferred from `cmd`'s shader; `kaleidoscope({ clear })` clears `'art'` | `'transform'`. Session owns the composite state and the web output track; `applyVideoEffects` retained as the lower-level primitive.

**Files created:**
- `src/kaleidoscope/session.ts`: singleton composite state per axis; web `onTrack` callback + `getTrack()`; native mutates in place.
- `src/kaleidoscope/dispatch.ts`: resolve a preset `cmd` against the bound book into `{ shader, args }` (with `opts` override), infer axis, reconcile to the track via `applyVideoEffects`.

**Files rewritten:**
- `src/index.ts`, `src/index.web.ts`: export `kaleidoscope`, generic over the consumer's `as const` book for cmd/opts inference.

**Gate:** `bun run build` passes; web demo drives blur/image/plasma and a transform purely through `kaleidoscope()`; web track swaps surface via `onTrack`.

#### Commit 14: Remove headline tuning setters; intern segmentation constants

**Goal:** Drop the slider surface. `sigma` lives in the `blur` preset; `hardness`/`threshold` become internal per-platform constants (the dialed-in values); `setDebugTiming`/`setSegmentationTargetShortSide` survive as `debug` exports.

**Files rewritten:**
- `src/index.ts`, `src/index.web.ts`: remove `setBlurSigma`/`setMaskHardness`/`setMaskThreshold`/`resetEffectTuning`; expose surviving debug knobs under a `debug` namespace.
- `src/web/tuning.ts` + native tuning: hold `hardness`/`threshold` as per-platform constants, not public setters.

**Gate:** all checks pass; no public `setMaskHardness` etc.; segmentation edge unchanged from the dialed-in values on web and Android.

### Phase G — Demo rewrite

#### Commit 15: Demo preset book + custom image

**Goal:** The demo, as the consumer, authors its book by hand (manual v1) and proves the consumer-asset path.

**Files created:**
- `demo/kaleidoscope.presets.ts`: the `as const` book — `blur-low/medium/high` (blur), the kept `background-image` presets, `acme-lobby` (consumer image via `require('./assets/backgrounds/acme-lobby.webp')`), `plasma-ocean/sunset/mint` + `plasma-slow/fast`, and the four `transform` presets. Header comment carries the plugin-wiring copy-paste.
- `demo/assets/backgrounds/acme-lobby.webp`: any demo-owned WebP (a derived/photographed lobby image; if none on hand, a generated 720p gradient placeholder).

**Gate:** `expo prebuild` in the demo copies the library shaders/images referenced plus `acme-lobby.webp`; book type-checks against `ShaderOptionsMap`.

#### Commit 16: Two radio banks; remove sliders

**Goal:** The demo screen is two single-select banks driving `kaleidoscope()`; active tile highlighted; no sliders.

**Files created:**
- `demo/src/art-bank.tsx`: single-select tile grid over the art presets (image stills as thumbnails; blur/plasma get an icon/placeholder), emits the selected id.
- `demo/src/transform-bank.tsx`: single-select transform buttons (de-emphasized).
- `demo/src/debug-overlay.tsx` (`🔀` from `effect-tuning-panel.tsx`): debug-timing + segmentation-short-side only.

**Files rewritten:**
- `demo/app/index.tsx`: render both banks; bind via `kaleidoscope(track, { presets, onTrack })`; selecting a tile calls `kaleidoscope({ cmd })`, the None tile calls `kaleidoscope({ clear })`.

**Files deleted:**
- `demo/src/effect-tuning-panel.tsx`, `demo/src/effect-toggles.tsx`.

**Gate:** all checks pass; web demo: one art + one transform compose; switching art tiles is single-select with highlight; no sliders remain.

### Phase H — Docs and self-destruct

#### Commit 17: README registry + plugin wiring; 3.0 migration note

**Goal:** Exact copy-paste for the preset book and the `plugins` entry (after `expo-build-properties`); state a dev/EAS build is required and Expo Go is unsupported; migration note for `applyVideoEffects`→`kaleidoscope` and removed setters.

**Files rewritten:**
- `README.md`, `package.json` (version 3.0.0 handled by release tooling; document the breaking surface).

**Gate:** `bun run build && bun run check:shaders` pass; README copy-paste, applied to a clean demo, prebuilds and runs.

#### Commit 18: Delete this plan

- Delete `kaleidoscope-command-and-preset-registry.md`.
- If the "shader = base engine, preset = patch" contract or the three-phase pipeline rule is worth keeping, extract it to a convention doc in a prior commit.

**Gate:** Project validation passes. Repo contains no references to the plan file.

## Verification checklist

- [ ] Per-effect args cross the bridge on all three platforms (Commit 1).
- [ ] Pipeline runs `normalize → art → transform`; mask lands correctly with a transform active (Commits 2–4).
- [ ] `plasma.frag` codegens to Android/web/iOS and `check:shaders` gates it (Commit 5).
- [ ] Generic shader processor animates plasma and composites on web, Android, iOS; live arg changes visible (Commits 6–8).
- [ ] Wrong options for a `shader` fail to compile; correct ones infer (Commit 9).
- [ ] No preset assets auto-bundle; `require.resolve` finds shader subpaths (Commit 10).
- [ ] Prebuild copies only referenced sources, deduped, idempotent; consumer image copied (Commit 11).
- [ ] Native registers exactly the curated sources via directory discovery (Commit 12).
- [ ] `kaleidoscope()` binds + commands both axes; web `onTrack` surfaces track swaps (Commit 13).
- [ ] Headline tuning setters removed; segmentation edge unchanged (Commit 14).
- [ ] Demo book type-checks; custom image proves the consumer-asset path (Commit 15).
- [ ] Demo is two single-select banks, composable, no sliders (Commit 16).
- [ ] README copy-paste prebuilds and runs on a clean demo; migration documented (Commit 17).
- [ ] Plan file deleted (Inspector Gadget Rule: no orphan plans).

## Answered questions

- **Composition:** real three-phase decoupling (`normalize → art → transform`), not a guard. Vision runs on the normalized upright frame; transform is last. Art and transform compose; each is single-select within its axis.
- **Parameter transport:** real runtime channel across the bridge (not bake-at-registration). One engine per source file; presets are JS-side named arg-bundles; call-time `opts` override works.
- **Specimen shader:** `plasma.frag`, a two-color time-morph (cheaper and richer than a starfield; exercises `uTime` + the param channel + the mask composite in one). All three platforms; web tested first.
- **Unification:** everything is a shader. One flat preset book of `{ name, shader, options }`; the image generator is named `background-image` (compositing is the shared tail, not a selectable thing); blur keeps its dedicated separable engine but is addressed as a shader. Axis inferred from the shader.
- **Contracts:** hand-authored TypeScript sibling per shader this PR; reflection/codegen deferred (separate issue), because GLSL carries types but not ranges/defaults, and we will know the generator's target shape only after hand-writing the first contract.
- **Web track / session / setters / transforms:** `onTrack` callback + `getTrack()`, singleton session; `sigma`→blur option, `hardness`/`threshold`→internal per-platform constants, debug knobs retained; transforms are presets over a built-in `transform` shader.

## Anti-patterns / scope boundaries

- **Not** generating contract TS from shader source (deferred to a follow-up issue).
- **Not** folding `blur`'s separable engine or `background-image` into the generic processor (the surface calls them shaders; the engine refactor is a later no-API-change cleanup).
- **Not** the init/scaffold CLI (#27) or drop-in picker components (#28); the demo authors its book by hand.
- **Not** end-user runtime image upload, arbitrary-URI decoding, or any managed-cloud shape; build-time curation only.
- **Not** wiring `nebula`/`simianlights`; they stay orphaned.
- **Not** multi-transform stacking (single-select within the transform axis).

## References

- Issue #26 — consumer-curated, tree-shakeable registry + the single `kaleidoscope()` command (this plan implements it, unified per the contract above).
- Issue #25 — generic procedural-background processor (this plan lands its first instance as `plasma`).
- Issues #27 (init CLI), #28 (picker components), #29 (presentation pass) — downstream, out of scope here.
- New issue (to be filed) — generate shader option contracts from shader source via reflection + a `check:shaders`-style drift gate; userland Zod for ranges.
