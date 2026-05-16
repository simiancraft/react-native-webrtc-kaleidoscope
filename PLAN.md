# Android GPU pipeline: blur and image-replacement effects

**Status:** Draft
**Scope:** subsystem
**Date:** 2026-05-16
**Last reviewed:** 2026-05-16

**Context:** Android's current effect pipeline is CPU-only and runs at ~5–10 FPS for blur. The dominant costs are manual Kotlin YUV/ARGB conversion, MLKit segmentation at full input resolution, per-pixel `IntArray` composite, and round-trips between `JavaI420Buffer`, `Bitmap`, and `RenderScript.Allocation`. The architecture is also CPU-locked; layering additional effects (image replacement, procedural backgrounds) compounds the cost. ShaderToy prototyping confirmed the GLSL math for both blur and image replacement runs comfortably on consumer GPUs; the work below ports that pipeline to Android via OpenGL ES 3.0 and the `SurfaceTextureHelper` already passed into `VideoFrameProcessor.process`. iOS Metal port and procedural backgrounds (simianlights, nebula) are separate scopes; auto-translation (SPIRV-Cross / CrossShader) is deferred until shader volume justifies it.

## Goal

Move the **blur** and **background-image** effects to a GPU pipeline on both **Android** (OpenGL ES 3.0 via `SurfaceTextureHelper`) and **web** (WebGL2 via `MediaStreamTrackProcessor`), driven by the same GLSL shader source on both targets. JS API upgrades from flat string names to **parameterized `EffectSpec` objects** so a single `blur` shader covers `blur-light`/`blur-heavy` (different `uSigma`, `uRadius` uniforms) and a single `background-image` shader covers `office-1`/`office-2` (different `uniform sampler2D uBackground`). Mirror axis fix bundled. MLKit (Android) / MediaPipe (web) still produce the person mask, downsampled, on a worker thread. iOS Metal pipeline deferred to a follow-up PR; cross-compilation (SPIRV-Cross) deferred until shader volume earns it.

Done when the EAS-installed APK runs blur and image-replacement at 25+ FPS on a midrange device, `bun run demo:web` shows the same effects working in Chrome at 30+ FPS, mirror flips horizontally (not vertically), and the plan deletes itself.

## Domain context

Five concepts the executing agent must hold:

1. **`SurfaceTextureHelper` is the GL thread.** `VideoFrameProcessor.process(frame, textureHelper)` is invoked on `textureHelper.handler`, which owns an EGL context. All GL calls must happen on this thread; calling `glGenTextures` from any other thread is undefined behavior.
2. **Input texture is OES external, not 2D.** Camera frames arrive as `TextureBufferImpl` wrapping `GL_TEXTURE_EXTERNAL_OES`. Sampling them requires `#extension GL_OES_EGL_image_external : require` and `samplerExternalOES`. The first shader pass converts OES → 2D so subsequent passes can use `sampler2D`.
3. **Mask production is async, composite must not block.** `Tasks.await(segmenter.process(...))` from `BlurFactory.kt` blocks the frame thread. We move to a worker thread; the composite uses the last-completed mask, accepting one frame of latency.
4. **Composite pattern is uniform across effects.** Every effect produces a `background` 2D texture; one shared composite shader does `mix(background, original, mask)`. Blur's background is a blurred copy of the camera; image-replacement's background is a sampled PNG. Variants are baked uniforms or different texture inputs to the same shader.
5. **Shader source is the same on Android and web.** GLSL ES 3.00 (`#version 300 es`) works on Android GLES 3.0 and WebGL2 with negligible diffs (web uses regular `sampler2D` for the camera input where Android needs `samplerExternalOES` in the very first pass). Web imports the shader strings from `src/web/shaders/*.ts`; Android mirrors the same source in `gpu/Shaders.kt` for v0.1. Refactor to a single source-of-truth file with a build step when shader count crosses ~5.
6. **Effects are parameterized via uniforms, not multiplied as files.** `applyVideoEffects(track, [{ name: 'blur', radius: 8, sigma: 4 }])`. One shader, infinite presets. The library ships two GLSL shaders (`blur.frag`, `background-image.frag` — both compose against the mask); JS objects pick the uniform values. Adding a new visual effect = new shader + native rebuild. Tweaking values, parameterizing UI, exposing sliders = pure JS, no rebuild.

## ~~File structure: before~~

```
react-native-webrtc-kaleidoscope/
├── android/src/main/java/com/simiancraft/kaleidoscope/
│   ├── KaleidoscopeModule.kt
│   ├── Registration.kt
│   └── effects/
│       ├── BlurFactory.kt              # CPU; ~390 lines, slow
│       └── MirrorFactory.kt            # CPU; ~60 lines, axis bug
├── android/build.gradle                # MLKit dep already present
├── android/src/main/assets/            # does not exist yet
├── backgrounds/                        # working-tree only, not in build path
│   ├── office-background-1.png
│   └── office-background-2.png
├── simianlights.glsl                   # working-tree only
├── nebula.glsl                         # working-tree only
└── WORKING-gpu-blur-prototype.glsl     # working-tree only
```

## File structure: after

**Legend:** `+` created, `~` modified, `-` removed.

```
react-native-webrtc-kaleidoscope/
├── ~ android/build.gradle                                       # keep MLKit
├── + android/src/main/assets/backgrounds/
│   ├── + office-1.png                                           # 1536×1024, ~2 MB
│   └── + office-2.png                                           # 1536×1024, ~2 MB
├── android/src/main/java/com/simiancraft/kaleidoscope/
│   ├── ~ KaleidoscopeModule.kt                                  # plumb Context through
│   ├── ~ Registration.kt                                        # register 6 effects
│   ├── + gpu/
│   │   ├── + Egl.kt                                             # context + thread helpers
│   │   ├── + GlProgram.kt                                       # shader compile/link
│   │   ├── + Fbo.kt                                             # framebuffer + texture pair
│   │   ├── + Shaders.kt                                         # GLSL as const val strings
│   │   ├── + Mask.kt                                            # MLKit on worker, last-mask cache
│   │   └── + GpuEffectProcessor.kt                              # shared VideoFrameProcessor
│   └── effects/
│       ├── ~ BlurFactory.kt                                     # CPU impl replaced
│       └── ~ MirrorFactory.kt                                   # axis fix
├── ~ src/index.ts                                               # EffectName union extended
├── ~ src/types.ts                                               # EffectName union extended
├── ~ demo/app/index.tsx                                         # radio UI for backgrounds
├── ~ demo/src/effect-toggles.tsx                                # radio variant
└── + PLAN.md                                                    # this file (deleted at end)
```

## Commits

### Commit 1: Pre-flight — local Android compile

**Goal:** Make Kotlin compile errors discoverable in seconds, not in 10-minute EAS builds.

**Files modified:**
- `package.json` — add `check:android` script that runs `cd demo/android && ./gradlew :react-native-webrtc-kaleidoscope:compileDebugKotlin`.

**Out-of-band:** install Android SDK + cmdline-tools + platform-34 + build-tools in WSL2. ~30 min one-time, documented in commit body.

**Gate:** `bun run check:android` returns 0 from a clean checkout. No code changes yet.

### Commit 2: Scaffold `gpu/` subpackage

**Goal:** Plumbing classes that compile but aren't called anywhere. Lets later commits add behavior without also adding scaffolding.

**Files created:**
- `android/src/main/java/com/simiancraft/kaleidoscope/gpu/Egl.kt` — EGL context save/restore helpers.
- `android/src/main/java/com/simiancraft/kaleidoscope/gpu/GlProgram.kt` — compile vertex+fragment, link, locate uniforms, set uniforms (uniform-name-keyed map).
- `android/src/main/java/com/simiancraft/kaleidoscope/gpu/Fbo.kt` — allocate (texture + framebuffer) pair at a given resolution.
- `android/src/main/java/com/simiancraft/kaleidoscope/gpu/Shaders.kt` — empty object holding `const val` strings; passthrough vertex + a no-op fragment to start.

**Gate:** `bun run check && bun run check:android` both green. Knip flags new files as unused (expected; later commits use them).

### Commit 3: GPU passthrough effect (architecture proof)

**Goal:** Prove `OES external texture → fragment shader → output texture-backed VideoFrame` survives the round-trip to `EglRenderer` and (separately) the encoder. No effect math; just sample input → write to output.

**Files created:**
- `android/src/main/java/com/simiancraft/kaleidoscope/gpu/GpuEffectProcessor.kt` — implements `VideoFrameProcessor`. Per-frame: bind OES sampler to input, render full-screen quad through a passthrough fragment shader into a 2D output texture, wrap as `TextureBufferImpl`, return new `VideoFrame`.
- `Shaders.kt` — add `OES_TO_2D_FRAG` shader (samples `samplerExternalOES`, writes `gl_FragColor`).

**Files modified:**
- `Registration.kt` — temporarily register a `"passthrough"` effect for manual EAS testing. Reverted before shipping.

**Gate:** `bun run check && bun run check:android` green. EAS build manual test: `_setVideoEffects(['passthrough'])` shows live camera unchanged. Failure modes (black frame, OES extension not declared, output not accepted by renderer) caught here before any effect logic exists.

### Commit 4: Composite shader + mock mask

**Goal:** Composite shader (`mix(background, camera, mask)`) wired in with a static white mask. Proves the multi-input shader pattern.

**Files modified:**
- `Shaders.kt` — add `COMPOSITE_FRAG`.
- `GpuEffectProcessor.kt` — add three-input composite path; mask texture defaults to a 1×1 white texture (so output == camera unchanged).

**Gate:** Compiles. No new effect registered; this is internal infrastructure.

### Commit 5: MLKit on worker thread; last-known-mask cache

**Goal:** Move MLKit segmentation off the frame thread; cache the most recent mask; upload as `GL_TEXTURE_2D` on the frame thread.

**Files created:**
- `gpu/Mask.kt` — owns the `SelfieSegmenterOptions(STREAM_MODE)` client, a worker thread, a volatile reference to the last `ByteBuffer` mask + dimensions, and a GL texture handle to which the latest mask is uploaded each frame.

**Files modified:**
- `GpuEffectProcessor.kt` — feeds downsampled camera bitmap (320×180) to `Mask.kt`; binds the mask texture to the composite shader.

**Gate:** Compiles. Still no effect registered.

### Commit 6: Blur effect on GPU

**Goal:** Two-pass separable Gaussian blur as the background source for the composite. Both light and heavy variants share one shader, baked uniforms.

**Files modified:**
- `Shaders.kt` — add `BLUR_FRAG` (1D Gaussian, accepts `uAxis` uniform for horizontal/vertical).
- `effects/BlurFactory.kt` — delete CPU implementation; replace with a `GpuEffectProcessor` configured for blur (two FBOs for ping-pong, blur shader on each pass, composite at end).
- `Registration.kt` — register `"blur-light"` (radius=8, sigma=4) and `"blur-heavy"` (radius=15, sigma=15). Keep `"blur"` as alias for `blur-medium` (radius=10, sigma=5) for backwards-compat with the existing demo.

**Gate:** `bun run check && bun run check:android` green. EAS build manual: `_setVideoEffects(['blur-light'])` and `['blur-heavy']` both visibly blur the background while keeping the person sharp. Target 25+ FPS.

### Commit 7: Image-replacement effect

**Goal:** PNG asset → `GL_TEXTURE_2D` → use as background source for composite.

**Files created:**
- `android/src/main/assets/backgrounds/office-1.png` — copy from working-tree `backgrounds/office-background-1.png`.
- `android/src/main/assets/backgrounds/office-2.png` — copy from working-tree `backgrounds/office-background-2.png`.
- `effects/BackgroundImageFactory.kt` — loads a named asset, decodes to `Bitmap` once on first frame, uploads to a 2D texture, configures `GpuEffectProcessor` to use that texture as the background source.

**Files modified:**
- `Registration.kt` — register `"background-office-1"` and `"background-office-2"`.

**Gate:** Both backgrounds composite cleanly behind the person on EAS build. Aspect ratio gracefully handled (center-crop or stretch; spec'd in commit body).

### Commit 8: Mirror axis fix

**Goal:** Rotation-aware mirror so the flip is always horizontal on screen regardless of camera rotation.

**Files modified:**
- `effects/MirrorFactory.kt` — branch on `frame.rotation % 180`: even (0/180) uses within-row reverse; odd (90/270) uses row-order reverse.

**Gate:** Mirror toggle on EAS build visibly flips left/right, never top/bottom, on the same device that previously showed inverted behavior.

### Commit 9: JS facade — extend `EffectName` union

**Goal:** TypeScript surface knows about the six effects.

**Files modified:**
- `src/types.ts` — `EffectName` widens to `'mirror' | 'blur' | 'blur-light' | 'blur-heavy' | 'background-office-1' | 'background-office-2'`.
- `src/index.ts` — no logic change; types only.

**Gate:** `bun run typecheck` green. `bun run check:package` clean.

### Commit 10: Demo UI — radio picker for background

**Goal:** Replace background-effect checkboxes with a single-select radio group; keep mirror as an independent toggle.

**Files modified:**
- `demo/src/effect-toggles.tsx` — add a `RadioGroup` variant for the background; mirror stays as a separate toggle.
- `demo/app/index.tsx` — track `mirrorOn: boolean` and `background: BackgroundChoice | null` instead of a `Set<EffectName>`. Compose them when calling `applyVideoEffects`.

**Gate:** `bun run check && bun run check:demo` green. EAS build manual: all six radio toggles + mirror independent toggle behave as Zoom-style picker.

### Commit 11: Cleanup pass

**Goal:** Remove temporary `"passthrough"` registration, knip-clean unused imports, run `bun run lint:fix`.

**Files modified:**
- `Registration.kt` — remove passthrough.
- Anywhere knip flags.

**Gate:** `bun run check` includes `check:knip`; must be clean.

### Commit 12: Delete this plan (Inspector Gadget Rule)

- Delete `PLAN.md`.
- Delete working-tree-only files no longer needed: `WORKING-gpu-blur-prototype.glsl`, `simianlights.glsl`, `nebula.glsl`, `backgrounds/`. (Or move to a `prototypes/` directory if we want to keep them as references — call decided at commit time, default delete.)

**Gate:** `git grep -F 'PLAN.md'` returns no results. `bun run check` green. EAS build still installs cleanly.

## Verification checklist

- [ ] `bun run check` passes.
- [ ] `bun run check:android` passes (local Kotlin compile).
- [ ] `bun run typecheck` passes.
- [ ] `bun run lint` passes.
- [ ] `bun run check:package` passes (publint + attw).
- [ ] `bun run check:knip` passes.
- [ ] EAS Android build green.
- [ ] On-device: `blur-light` visibly blurs background, person stays sharp, 25+ FPS.
- [ ] On-device: `blur-heavy` visibly blurs background heavier, person stays sharp, 25+ FPS.
- [ ] On-device: `background-office-1` replaces background with image, person remains, 25+ FPS.
- [ ] On-device: `background-office-2` replaces background with second image, person remains, 25+ FPS.
- [ ] On-device: `mirror` flips horizontally (not vertically) regardless of phone orientation.
- [ ] On-device: switching between effects (radio UX) does not crash.
- [ ] On-device: untoggling all backgrounds returns to unmodified camera.
- [ ] Plan file deleted (Inspector Gadget Rule).

## Two-key handshake before deletion

Plan deletes itself in Commit 12 only when:

1. **Author key:** every gate above passes, including the on-device checks.
2. **Reviewer key:** Jesse confirms the device test in chat. No silent self-deletion.

## References

- `bootstrap-and-ship-v0-1.md` — sibling plan with the same shape; deleted when v0.1 shipped.
- `demo/node_modules/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/videoEffects/VideoEffectProcessor.java` — upstream caller of `process()`; contract notes in Domain context #2.
- `demo/node_modules/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/GetUserMediaImpl.java:411` — `setVideoEffects` bridge entry; null vs empty-array behavior.
- `WORKING-gpu-blur-prototype.glsl` — ShaderToy-validated separable blur source for Commit 6.
- `aclysma.github.io/rafx/docs/shaders/glsl_to_msl.html` — auto-translation reference for the iOS PR follow-up.
- `github.com/alaingalvan/crossshader` — npm wrapper around the same toolchain; evaluated, not adopted.
