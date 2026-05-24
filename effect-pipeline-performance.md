# Effect Pipeline Performance

**Status:** In progress
**Scope:** cross-stack
**Date:** 2026-05-24
**Last reviewed:** 2026-05-24
**Context:** The effect pipeline is not yet shippable on real devices: it stalls the capture thread on the GPU every frame (R3), the background composite over-zooms (cover-fit against the wrong aspect), and a weak phone does the same heavy work as a strong one (no capability adaptation). This plan consolidates the former `optimize-effect-pipeline-performance.md` and `device-tiered-quality-and-background-fit.md` into one performance arc. RVM/MODNet/PaddleSeg were evaluated and rejected (licensing + runtime weight); we keep the single-source GLSL → MSL/Kotlin/web architecture, thin native hosts, and all pixel work on the GPU.

## Goal

Make the library worth a download and ship-ready on the devices it will actually meet: the iPhone X (A11) is the defined floor, the user base is A15-class (iPhone 13/14). Three remaining moves: finish the perf rubric by removing the per-frame CPU↔GPU stall (R3), fix the background to cover-fit the displayed frame at natural scale, and add a self-classifying device-quality tier that scales processing resolution and segmentation quality to the hardware. Done looks like: identical/correct visual output; the per-frame `waitUntilCompleted`/`glFinish` replaced by returning the previous frame's completed output so CPU and GPU overlap; backgrounds fill the frame without over-zoom on both platforms; the transform ops read screen-consistent across web/Android/iOS; and a `QualityTier` that auto-downscales on the A11 floor while a 13/14 runs ambitious; all verified on an EAS build.

## Domain context

1. **The effect path.** Per frame: camera (OES texture on Android, NV12 `CVPixelBuffer` on iOS, `VideoFrame` on web) → "original 2D" copy → (blur: two separable Gaussian passes on a downscaled ping-pong) → `composite(original, background, mask)` → output buffer handed synchronously to WebRTC.
2. **The 7-axis perf rubric.** R1 resolution, R2 sample/pass budget, R3 sync points, R4 allocation churn, R5 copies/conversions, R6 segmentation coupling, R7 precision. R1/R2/R5/R6 are shipped; **R3 is the one substantive rubric item left.**
3. **Orientation (the shared fix).** Native effects run in the camera BUFFER space; the display rotates by `frame.rotation`. The per-platform `Orientation` helper (`gpu/Orientation.kt`, `gpu/Orientation.swift`) is the single place the rotation correction lives, mapping a screen-space op → a buffer-space `uUvTransform`. Android's GL/OES pipeline carries camera orientation; iOS works on the raw buffer and carries a Metal per-pass V-flip. Each helper has a documented one-line toggle for screenshot calibration.
4. **Cover vs contain.** Cover-fit (aspectFill) fills the frame and crops the overflow axis, at natural object scale; against the **displayed** (rotation-corrected) aspect. The current over-zoom is cover-fit computed against the raw landscape buffer aspect, then re-cropped by the portrait display. Contain (the "chipmunk" shrink) is wrong.
5. **`QualityTier`.** A never-user-facing enum (`Unsupported`/`Low`/`Medium`/`High`/`Superior`) auto-selected from *monotonic* capability thresholds (iOS `MTLDevice.supportsFamily`; Android RAM + cores), so a future faster phone self-classifies with no upkeep. It sets a device-agnostic **target processing resolution** plus a device-agnostic **quality level** each platform maps to its own segmentation control (iOS Vision `.fast`/`.balanced`/`.accurate`; web MediaPipe `modelSelection`; Android MLKit).

## Completed (shipped on `perf/optimize-effect-pipeline`; pending on-device EAS verify)

- **R1** quarter-area blur (web/Android/iOS); **R2** linear-sampled 5-tap kernel; **R5** web background upload hoisted out of the per-frame loop; **R6** web segmentation decoupled from the render path; web per-pass GPU timing.
- Serration ("wax paper") fix (downsample-first on all platforms); dialed-in defaults (sigma 5 / hardness 0.5 / threshold 0.7); iOS blur-background vertical-flip fix.
- Single-source `shaders/transform.frag` + per-platform codegen split; `Orientation` helpers (Kotlin + Swift); transform ops `flip-x`/`flip-y`/`rotate-cw`/`rotate-ccw` registered through one processor per platform; the old `mirror` effect retired (`flip-x` is its corrected screen-horizontal replacement). Web verified correct; native is a first cut pending calibration.
- Packaging: `office-1/2` → `dark-office`/`light-office` rename; demo three-column (Translate / Background / Blur) scrollable, max-width layout.

## Current surface area (remaining phases)

| File | Role | Phase |
|------|------|-------|
| `ios/.../effects/BackgroundImageProcessor.swift`, `android/.../effects/BackgroundImageFactory.kt`, `src/web/effects/background-image.ts` | Background cover-fit | 1 |
| `gpu/Orientation.swift`, `gpu/Orientation.kt` | Reused for rotation-corrected aspect; calibration toggles | 1, 2 |
| `src/backgrounds/presets.ts`, new `src/backgrounds/debug-grid.*`, `package.json` exports, native asset trees, `demo/app/index.tsx` | Debug-grid background preset | 1 |
| `ios/.../gpu/MetalRenderer.swift`, `ios/.../effects/{Blur,BackgroundImage,Transform}Processor.swift` | iOS frame-pipelining (R3) + native GPU timing | 2 |
| `android/.../effects/{Blur,BackgroundImage,Transform}Factory.kt` | Android frame-pipelining (R3) + native GPU timing | 2 |
| new `src/quality-tier.ts`, `ios/.../KaleidoscopeModule.swift`, `android/.../KaleidoscopeModule.kt` | `QualityTier` + capability detection | 3 |
| `EffectTuning.swift/.kt`, `src/web/tuning.ts`, `ios/.../segmentation/Segmenter.swift`, `android/.../segmentation/Mask.kt`, `src/web/segmenter.ts` | Per-tier quality + target-resolution downscale | 3 |

## Commits

### Phase 1: Background cover-fit + debug-grid background

**Goal:** Cover-fit the background against the displayed (rotation-corrected) aspect so it fills the frame at natural scale, reusing `Orientation`; and add a debug background carrying viewport-size markers so clipping/crop/scale are objectively verifiable on device.

**Files created:**
- `src/backgrounds/debug-grid.ts` + `.web.ts` + `.webp`: third preset (the user-provided debug image with viewport-size markers).

**Files rewritten:**
- `android/.../effects/BackgroundImageFactory.kt`, `ios/.../effects/BackgroundImageProcessor.swift`: compute the cover-fit against the rotation-corrected output aspect (via `Orientation` / `frame.rotation` w/h swap on 90/270), not the raw landscape buffer.
- `src/web/effects/background-image.ts`: align the cover-fit math against the canvas (display) aspect.
- `src/backgrounds/presets.ts` (`BACKGROUND_PRESETS`), `package.json` exports, native asset trees (`android/src/main/assets/backgrounds/`, `ios/.../resources/backgrounds/`), `demo/app/index.tsx` (Background section button).

**Gate:** `bun run check` passes; `bun run check:android` compiles; iOS via EAS. On device the background fills the frame at natural scale and the debug grid reads square (no over-zoom, correct crop).

### Phase 2: Frame-pipelining (R3) + native GPU timing

**Goal:** Stop blocking the capture thread on the GPU every frame. Submit the current frame's work without waiting and return the previous frame's completed output (one frame of added latency). Applies to all three native processors (blur, background-image, transform), which share the stall. Add the native per-pass timing that confirms the overlap.

**Files rewritten:**
- `ios/.../gpu/MetalRenderer.swift`: a `DispatchSemaphore(value: maxFramesInFlight)`; `wait()` before encode, `signal()` in `addCompletedHandler`. Read `gpuStartTime`/`gpuEndTime` behind a debug flag.
- `ios/.../effects/{Blur,BackgroundImage,Transform}Processor.swift`: drop `waitUntilCompleted`; hold and return the last completed output buffer, committing the current buffer asynchronously (`CVPixelBufferPool(min: 3)` already backs this).
- `android/.../effects/{Blur,BackgroundImage,Transform}Factory.kt`: replace the per-frame `glFinish` with a fence/previous-frame return; bracket passes with `glBeginQuery(GL_TIME_ELAPSED_EXT)` behind a debug flag.

**Gate:** `bun run check:android` compiles; iOS via EAS. Effect output still correct on device; the timing log shows CPU/GPU overlap and a higher sustained FPS than the pre-change baseline.

### Phase 3: Device-tiered quality

**Goal:** Self-classify the device and scale processing resolution + segmentation quality to it, so the A11 floor degrades gracefully and a 13/14 runs ambitious, with zero library upkeep as new phones ship.

**Files created:**
- `src/quality-tier.ts`: the `QualityTier` enum and a pure `settingsForTier(tier) -> { targetShortSide, segmentationQuality }`.

**Files rewritten:**
- `ios/.../KaleidoscopeModule.swift`: `deviceCapabilityTier()` from `MTLDevice.supportsFamily` thresholds (monotonic). `android/.../KaleidoscopeModule.kt`: from `ActivityManager` RAM + `Runtime.availableProcessors`.
- `EffectTuning.swift/.kt` + `src/web/tuning.ts`: add `segmentationQuality` and `targetShortSide` params + setters; the module reads the native tier at init and applies `settingsForTier`.
- `ios/.../segmentation/Segmenter.swift`: map quality → `VNGeneratePersonSegmentationRequest.qualityLevel`; downscale the Vision input to `targetShortSide` (currently runs full-frame). `android/.../segmentation/Mask.kt`: make the 256 downsample the `targetShortSide` param. `src/web/segmenter.ts`: map quality → MediaPipe `modelSelection`.

**Gate:** `bun run check` passes; `bun run check:android` compiles; iOS via EAS. `deviceCapabilityTier` returns Low on an iPhone X and High/Superior on an A15; lag/blob reduced on the X.

### Phase 4: Delete this plan

Delete `effect-pipeline-performance.md` as its own commit once the verification checklist is green. The orientation rule stays in `PATTERNS.md` and the `Orientation` helpers.

## Scope boundaries (explicitly not in this plan)

- **Root iOS orientation fix** (make the Metal passthrough negate Y so no per-effect compensation is needed): deferred; we keep the documented per-platform `Orientation` compensation.
- **Runtime-measured adaptive tiering** (downgrade by observed frame time): deferred; the static capability proxy ships first.
- **R7 precision/bandwidth** and the CoreImage→YUV-in-shader ingest swap: deferred; gated on the Phase 2 timing numbers.
- **Mirror as a shipped preset:** no; the transform ops are calibration tools.

## Verification checklist

- [ ] Background cover-fits the displayed aspect (debug grid reads square, no over-zoom) on Android + iOS (Phase 1).
- [ ] Transform ops (flip-x/y, rotate-cw/ccw) read screen-consistent with the web reference on both portrait phones; `Orientation` toggles calibrated (Phase 1 EAS build).
- [ ] Per-frame GPU stall removed; native timing shows CPU/GPU overlap and higher sustained FPS (Phase 2).
- [ ] `deviceCapabilityTier` sane on iPhone X (Low) and A15 (High/Superior); resolution + segmentation quality applied per tier (Phase 3).
- [ ] R1/R2 perf wins confirmed on device (folded into the first EAS build).
- [ ] `bun run check`, `bun run check:shaders`, `bun run check:android` green; iOS EAS build succeeds.
- [ ] Plan file deleted (Inspector Gadget Rule).

## References

- Supersedes (deleted) `optimize-effect-pipeline-performance.md` and `device-tiered-quality-and-background-fit.md`.
- `PATTERNS.md` "Texture-orientation convention"; the `Orientation` helpers carry the Metal per-pass V-flip detail.
- Memory: dialed-in tuning, perf rubric, transform-ops state (in the project memory store).
