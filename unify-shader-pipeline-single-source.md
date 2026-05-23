# Unify the shader pipeline to a single GLSL source of truth

**Status:** In progress
**Scope:** cross-stack
**Date:** 2026-05-22
**Last reviewed:** 2026-05-22
**Progress:** Commits 1–3 shipped and verified (TS checks, Android `compileDebugKotlin`, drift gate). Remaining: visual verification of blur/background-image/composite on web + Android + iOS (web blur falloff changed in Commit 2), then Commit 4 (delete this plan).
**Context:** The same shader logic is hand-maintained in three places (root `shaders/*.frag` → iOS, `android/.../gpu/Shaders.kt`, `src/web/shaders.ts`). The `composite` shader is byte-identical across all three, but `blur` has already drifted into two different algorithms, so editing a shader once does not propagate. Consolidating now is safe because all three copies currently render correctly.

## Goal

Editing or adding a shader today means touching up to three files that can silently drift; `blur` already has (web runs a 41-tap dynamic Gaussian, native a 9-tap precomputed kernel). This blocks the iOS performance work, where a single efficient shader edit should benefit every runtime.

Make `shaders/*.frag` + `*.vert` the only authored source. One offline build (`bun run build:shaders`) transpiles to iOS `.metalsrc` (existing) and **generates** the Android Kotlin and web TypeScript copies. A CI gate fails if any generated artifact is stale.

Done when: editing a canonical `.frag` and running `build:shaders` updates all three runtimes; `blur` is unified to the native 9-tap kernel (web rewritten to match); `check:shaders` is green and fails on drift; the three effects still render correctly on web, Android, and iOS.

## Domain context

1. **Three runtimes, three consumption models.** Web (WebGL2) and Android (GLES 3.0) compile GLSL ES 3.00 *source strings* directly at runtime. iOS cannot: `scripts/transpile-shaders.ts` transpiles the GLSL to MSL (`.metalsrc`) offline, and `ShaderLibrary.swift` compiles that at runtime. So iOS needs codegen; the other two currently *inline* the GLSL by hand.
2. **Shared set vs. platform-locals.** Only three shaders are genuinely cross-runtime: `passthrough.vert`, `blur.frag`, `composite.frag`. Android also has `OES_PASSTHROUGH_FRAG` (`samplerExternalOES`, external camera texture) and a `TWO_D_PASSTHROUGH_FRAG` in `Mask.kt` that have no web/iOS twin. These stay hand-written and Android-local; the generator only owns the shared set.
3. **The blur divergence (the one real reconcile).** Canonical = the native **9-tap precomputed kernel** (`uWeights[9]`/`uOffsets[9]`, no per-pixel `exp()`; already in `shaders/blur.frag` and `Shaders.kt`). Web's current `BLUR_FRAG_SRC` is a 41-tap in-shader Gaussian driven by `uSigma`. Web's host must be rewritten to compute the kernel on the CPU and upload the arrays. The kernel math to port is `BlurFactory.kt::ensureKernel` (taps=9, spacing=2.0, `w=exp(-x²/2σ²)`, normalized by `w0 + 2·Σwᵢ`).
4. **Per-platform orientation stays in host code, not the shader.** `composite.frag` is already platform-agnostic; the V-flip differences live in `uMaskUvScale`/`uMaskUvOffset` uniforms set by each host (web `(1,-1)/(0,1)`, Android identity). The generator does not touch host uniform code.
5. **Generated vs. hand-written boundary.** New generated files (`ShadersGenerated.kt`, `shaders.generated.ts`) hold only the shared set. The existing `Shaders.kt` / `shaders.ts` keep their rich per-platform doc comments and platform-local shaders, and **delegate** the shared consts to the generated files so consumer call sites do not change.

## Current surface area

| File | Role | Disposition |
|---|---|---|
| `shaders/{passthrough.vert,blur.frag,composite.frag}` | iOS canonical source (already) | becomes the single source for all three |
| `shaders/{nebula,simianlights}.frag` | procedural backgrounds, unwired | out of scope (Plan 2) |
| `scripts/transpile-shaders.ts` | GLSL→MSL transpile | renamed/expanded to `scripts/build-shaders.ts` |
| `ios/KaleidoscopeModule/shaders/*.metalsrc` | transpiled MSL, runtime-compiled | regenerated (content unchanged) |
| `android/.../gpu/Shaders.kt` | inlined Kotlin GLSL consts + OES/comments | shared consts delegated to generated; OES + comments kept |
| `android/.../effects/BlurFactory.kt` | owns `ensureKernel` (canonical kernel math) | unchanged; referenced by web port |
| `src/web/shaders.ts` | inlined TS GLSL consts | shared consts re-exported from generated; docs kept |
| `src/web/effects/blur.ts` | web blur host, sets `uSigma` (line 213) | rewritten to upload `uWeights`/`uOffsets` |
| `package.json` | scripts | add `build:shaders`, `check:shaders` |
| `.github/workflows/ci.yml` | CI | add the `check:shaders` drift gate |

## File structure: after

**Legend:** `+` created, `~` modified, `🔀` renamed

```
react-native-webrtc-kaleidoscope/
├── 🔀 scripts/build-shaders.ts        // from scripts/transpile-shaders.ts; + Android/web codegen
├── shaders/
│   ├── passthrough.vert               // canonical (unchanged)
│   ├── blur.frag                      // canonical 9-tap (unchanged)
│   └── composite.frag                 // canonical (unchanged)
├── android/src/main/java/com/simiancraft/kaleidoscope/gpu/
│   ├── + ShadersGenerated.kt          // generated: shared trio as const val
│   └── ~ Shaders.kt                   // delegates shared consts; keeps OES_PASSTHROUGH_FRAG + comments
├── src/web/
│   ├── + shaders.generated.ts         // generated: shared trio as string consts
│   ├── ~ shaders.ts                   // re-exports shared from generated; keeps docs
│   └── effects/
│       └── ~ blur.ts                  // CPU kernel (port of ensureKernel); uploads uWeights/uOffsets; drops uSigma
└── ios/KaleidoscopeModule/shaders/
    └── *.metalsrc                     // regenerated by build:shaders (content unchanged)
```

## Commits

### ✅ Commit 1: Expand the transpiler into a multi-target shader build with Android + web codegen

**Goal:** One script emits all three runtimes' artifacts from `shaders/`; the already-identical shaders (`passthrough`, `composite`) are switched to generated; blur is left untouched this commit.

**Files moved/renamed:**
- `scripts/build-shaders.ts ← scripts/transpile-shaders.ts`

**Files rewritten:**
- `scripts/build-shaders.ts` — keep the GLSL→SPIR-V→MSL path; add two codegen emitters: (a) `android/.../gpu/ShadersGenerated.kt` (a `ShadersGenerated` object with `const val` triple-quoted strings for the shared set), (b) `src/web/shaders.generated.ts` (exported `const` strings). Deterministic output (stable ordering, fixed header). Continue writing `SHADERS.txt`.
- `android/.../gpu/Shaders.kt` — change `PASSTHROUGH_VERT` and `COMPOSITE_FRAG` to delegate (`val PASSTHROUGH_VERT = ShadersGenerated.PASSTHROUGH_VERT`); keep `OES_PASSTHROUGH_FRAG` and all comments. (`BLUR_FRAG` still delegated in Commit 2.)
- `src/web/shaders.ts` — re-export `PASSTHROUGH_VERT_SRC` and `COMPOSITE_FRAG_SRC` from `./shaders.generated`; keep the doc comments. (`BLUR_FRAG_SRC` still local until Commit 2.)

**Files created:**
- `android/.../gpu/ShadersGenerated.kt`, `src/web/shaders.generated.ts` (generated artifacts, committed).

**Files modified:**
- `package.json` — rename script to `"build:shaders": "bun run scripts/build-shaders.ts"`; keep a `transpile:shaders` alias if anything references it.
- Canonicalize `passthrough.vert` to `out highp vec2 vUv` (matches root; harmless on web/Android).

**Gate:** `bun run build:shaders` runs clean; `git diff` on the generated files is empty after a second run (determinism). `bun run check` passes (lint, typecheck, build, test, knip, publint). `bun run check:android` compiles.

### ✅ Commit 2: Reconcile web blur onto the canonical 9-tap kernel

**Goal:** Web blur uses the same `blur.frag` as native; the divergence is gone.

**Files rewritten:**
- `src/web/effects/blur.ts` — add a module-level `ensureKernel(sigma)` porting `BlurFactory.kt::ensureKernel` (9 taps, spacing 2.0, Gaussian weights normalized by `w0 + 2·Σwᵢ`), cached by sigma. Before pass 1, set `uWeights`/`uOffsets` via `uniform1fv` (query locations as `uWeights[0]`/`uOffsets[0]` for cross-impl safety). Remove the `uSigma` uniform (line 213). H/V passes and composite otherwise unchanged.
- `src/web/shaders.ts` — re-export `BLUR_FRAG_SRC` from `./shaders.generated`; delete the local 41-tap source.
- `android/.../gpu/Shaders.kt` — delegate `BLUR_FRAG` to `ShadersGenerated.BLUR_FRAG`.

**Files modified:**
- `src/web/shaders.generated.ts`, `ShadersGenerated.kt` — regenerated (now include blur).

**Gate:** `bun run check` passes. `bun run build:shaders` regen leaves no diff. **Manual:** `bun run demo:web` blur still renders correctly (expected: slightly different falloff vs. before, matching native — verify it looks good, no banding/hard edge). Android/iOS unaffected (their blur was already canonical).

### ✅ Commit 3: Add the drift gate

**Goal:** CI fails if a generated artifact is stale relative to `shaders/`.

**Files modified:**
- `package.json` — add `"check:shaders": "bun run build:shaders && git diff --exit-code -- android/**/ShadersGenerated.kt src/web/shaders.generated.ts ios/KaleidoscopeModule/shaders"`. Add `check:shaders` to the `check` aggregate.
- `.github/workflows/ci.yml` — run `bun run check:shaders` (needs the glslang/spirv toolchain on the runner; install step or skip the MSL diff on CI and assert only the Kotlin/TS codegen, whichever is cheaper — decide while wiring).

**Gate:** `check:shaders` green on a clean tree; editing a `.frag` without regenerating makes it fail (verify by hand, then revert).

### Commit 4: Delete this plan

- Delete `unify-shader-pipeline-single-source.md`.
- If the generated/hand-written boundary convention is worth keeping, add a short note to `PATTERNS.md` first.

**Gate:** `bun run check` passes. `git grep -F 'unify-shader-pipeline-single-source'` returns no results.

## Verification checklist

- [x] `bun run build:shaders` emits iOS `.metalsrc`, `ShadersGenerated.kt`, `shaders.generated.ts` deterministically.
- [x] `passthrough`, `blur`, `composite` come from `shaders/` for all three runtimes; only `OES_PASSTHROUGH_FRAG` / `TWO_D_PASSTHROUGH_FRAG` remain hand-written and Android-local.
- [x] Web blur uses the 9-tap kernel; `uSigma` is gone from `blur.ts`.
- [x] `bun run check` passes; `bun run check:android` compiles.
- [x] `check:shaders` is green and fails on an un-regenerated `.frag` edit.
- [ ] Blur/background-image/composite render correctly on web, Android, and a real iOS device.
- [ ] Plan file deleted (Inspector Gadget Rule).

## References

- `android/.../effects/BlurFactory.kt::ensureKernel` — canonical kernel math to port to web.
- `src/web/effects/blur.ts:213` — current `uSigma` upload to remove.
- `ios/KaleidoscopeModule/gpu/ShaderLibrary.swift` — runtime `makeLibrary(source:)` consumer of `.metalsrc`.
- `wire-procedural-background-effects.md` — Plan 2 (depends on this plan): wires `nebula`/`simianlights` + demo UI.
