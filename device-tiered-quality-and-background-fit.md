# Device-Tiered Quality and Correct Background Fit

**Status:** In progress
**Scope:** cross-stack
**Date:** 2026-05-24
**Last reviewed:** 2026-05-24
**Context:** The library is not yet shippable on real devices: the background composite over-zooms (cover-fit computed against the wrong aspect), and there is no adaptation to device capability, so a weak phone does the same heavy work as a strong one and falls behind (lag, blobby mask). The user base is A15-class (iPhone 13/14); the iPhone X (A11) is the defined floor.

## Goal

Make the effect look right and run within budget on every device the library will actually meet. Three changes: (1) cover-fit the background to the *displayed* aspect so it fills the frame at natural scale instead of an over-zoomed slice; (2) add a `QualityTier` (Unsupported/Low/Medium/High/Superior) auto-selected from device capability via monotonic thresholds (so new phones self-classify with no library upkeep), which sets a device-agnostic processing resolution plus per-platform segmentation-quality controls; (3) document the iOS Metal orientation gotcha so future shaders don't reintroduce the axis flip. Done looks like: a 13/14 runs ambitious and clean, an iPhone X degrades gracefully to a usable floor, backgrounds fill the frame correctly on both, and the orientation rule is written down where the next shader author (human or LLM) will read it.

## Domain context

1. **Cover vs contain.** Cover-fit (aspectFill) scales the background to fill the frame and crops the overflow axis: natural object scale, sensible crop (what Zoom does). Contain (aspectFit) shrinks the whole image to fit with letterbox bars: the "chipmunk" look. We want cover, against the *displayed* aspect. The current over-zoom is a bug (cover-fit against the landscape buffer aspect, then re-cropped by the portrait display), not the cover strategy.
2. **`QualityTier`.** A single enum, never user-facing, selected like a video game's graphics auto-detect. `Unsupported` (defensive sink) → `Low` (iPhone-X floor) → `Medium` → `High` → `Superior`. It sets two things: a device-agnostic **target processing resolution** and a device-agnostic **quality level** that each platform maps to its own controls.
3. **Self-maintaining selection.** Capability detection per platform with *monotonic* thresholds: iOS by highest supported Metal GPU family (`MTLDevice.supportsFamily`), Android by RAM + CPU cores. "≥ threshold = top tier," so a future faster phone lands at the top automatically with zero code change.
4. **Per-platform quality mapping.** The agnostic quality level maps to: iOS Vision `qualityLevel` (`.fast`/`.balanced`/`.accurate`); web MediaPipe `modelSelection`; Android MLKit (coarser — mode + raw-size). The target-resolution downscale is identical in meaning everywhere.
5. **iOS Metal per-pass flip (the recurring axis bug).** Metal's render-target origin is top-left while NDC bottom is −1; the transpiled `passthrough.metalsrc` does NOT negate `gl_Position.y` (despite comments claiming it does), so every render-to-texture pass flips vertically. OpenGL (Android/web) is self-consistent and does not. Effects with an odd number of pre-composite passes accumulate a net flip; the blur background hit this. Fix pattern: per-effect UV compensation via the composite's `uBgUvScale`/`uMaskUvScale` uniforms (already designed for this).

## Current surface area

| File | Role | Phase |
|------|------|-------|
| `PATTERNS.md` | Durable conventions doc | 1 (orientation rule, kept) |
| `shaders/passthrough.vert`, `ios/.../gpu/MetalRenderer.swift` | False "spirv-cross negates Y" comments | 1 |
| `src/web/effects/background-image.ts`, `android/.../effects/BackgroundImageFactory.kt`, `ios/.../effects/BackgroundImageProcessor.swift` | Background cover-fit | 2 |
| `src/web/tuning.ts`, `android/.../EffectTuning.kt`, `ios/.../EffectTuning.swift` | Runtime params (add quality + target res) | 3, 4 |
| `ios/.../KaleidoscopeModule.swift`, `android/.../KaleidoscopeModule.kt` | Expose `deviceCapabilityTier` + new setters | 3, 4 |
| `src/index.ts` (+ a new `src/quality-tier.ts`) | Tier → settings map (shared JS) | 3 |
| `ios/.../segmentation/Segmenter.swift`, `android/.../segmentation/Mask.kt`, `src/web/segmenter.ts` | Quality level + input downscale | 4 |
| `demo/src/effect-tuning-panel.tsx` | Optional flip-v/flip-h calibration | 5 |

## Commits

### Commit 1: Document the iOS Metal orientation rule; fix the false comments

**Files rewritten:**
- `PATTERNS.md`: add an "iOS Metal orientation" section — every Metal render-to-texture pass flips vertically (the transpiled passthrough does not negate `gl_Position.y`); OpenGL does not; count pre-composite passes; odd parity needs a compensating V-flip via the composite UV uniforms. This is the durable artifact that survives this plan's deletion.
- `shaders/passthrough.vert`, `ios/.../gpu/MetalRenderer.swift`: correct the comments that claim spirv-cross emits a Y-inversion (it does not).

**Gate:** `bun run check:shaders` clean (comment lives in the GLSL header, stripped on transpile — no artifact change); `bun run check` passes.

### Commit 2: Cover-fit the background to the displayed aspect

**Goal:** Cover-fit against the displayed (rotation-corrected) aspect, not the raw landscape buffer, so the background fills the frame at natural scale. Interim source for the displayed aspect: `frame.rotation` (swap w/h when 90/270); the explicit measured size from the tier work (Commit 3/4) can refine it later.

**Files rewritten:**
- `android/.../effects/BackgroundImageFactory.kt`, `ios/.../effects/BackgroundImageProcessor.swift`: compute `outAspect` from the rotation-corrected output dims before the cover-fit branch.
- `src/web/effects/background-image.ts`: cover-fit against the canvas (display) aspect (web has no rotation issue, but align the math).

**Gate:** `bun run check` passes; `bun run check:android` compiles; iOS via EAS. Background fills the frame at natural scale (verify on device).

### Commit 3: `QualityTier` + capability detection + shared tier→settings map

**Files created:**
- `src/quality-tier.ts`: the `QualityTier` enum and a pure `settingsForTier(tier)` → `{ targetShortSide, segmentationQuality }` map (device-agnostic). Plus `tierFromCapability(rawCapability)` if any JS-side mapping is needed.

**Files rewritten:**
- `ios/.../KaleidoscopeModule.swift`: expose `deviceCapabilityTier()` computed from `MTLDevice.supportsFamily` thresholds (monotonic).
- `android/.../KaleidoscopeModule.kt`: expose `deviceCapabilityTier()` from RAM (`ActivityManager`) + cores (`Runtime.availableProcessors`).
- `src/index.ts` / module JS: read the native tier at init, apply `settingsForTier` via the setters.

**Gate:** `bun run check` passes; `bun run check:android` compiles; iOS via EAS.

### Commit 4: Per-platform quality mapping + agnostic target-resolution downscale

**Files rewritten:**
- `ios/.../EffectTuning.swift`, `android/.../EffectTuning.kt`, `src/web/tuning.ts`: add `segmentationQuality` and `targetShortSide` (or scale) params with setters.
- `ios/.../segmentation/Segmenter.swift`: map quality → `VNGeneratePersonSegmentationRequest.qualityLevel`; downscale the Vision input to `targetShortSide` (iOS currently runs Vision on the full frame — Android already downsamples to 256).
- `android/.../segmentation/Mask.kt`: honor `targetShortSide` for the downsample (already 256; make it the param).
- `src/web/segmenter.ts`: map quality → MediaPipe `modelSelection`.
- The effect processors size their work off `min(camera frame, targetShortSide-derived dims)`.

**Gate:** `bun run check` passes; `bun run check:android` compiles; iOS via EAS. iPhone X lands in Low (fast, downscaled) with tighter tracking; a 13/14 lands High/Superior.

### Commit 5 (optional): Demo mirror → flip-vertical / flip-horizontal calibration

**Files rewritten:**
- `demo/src/effect-tuning-panel.tsx` (or the effect picker): relabel/repurpose mirror as explicit flip-v / flip-h toggles for orientation calibration. Demo-only; not a shipped preset.

**Gate:** `bun run check` passes.

### Commit 6: Delete this plan

- Delete `device-tiered-quality-and-background-fit.md`. The orientation rule (Commit 1) stays in `PATTERNS.md`.

**Gate:** `bun run check` passes; no references to the plan file remain.

## Scope boundaries (explicitly not in this plan)

- **Root orientation fix** (make the Metal passthrough negate Y so iOS needs no per-effect compensation): deferred. It would change orientation for every iOS effect at once and require re-verifying all of them on device. We keep the documented per-effect-compensation pattern.
- **Runtime-measured adaptive tiering** (downgrade by observed frame time): deferred; the static capability proxy ships first. Depends on per-frame timing instrumentation.
- **Display-size-driven processing cap as a distinct lever:** the device tier is the primary lever; the measured display size only refines the cover-fit aspect for now.
- **Mirror as a shipped preset:** no — it's a calibration tool only.
- **Simulator testing of the live effect:** the iOS simulator has no camera, so it can't exercise the live video pipeline; it's compile/UI only, not an effect test.

## Verification checklist

- [ ] iOS Metal orientation rule documented in `PATTERNS.md`; false Y-negation comments corrected (Commit 1).
- [ ] Background cover-fits the displayed aspect (natural scale, no over-zoom) on Android + iOS (Commit 2).
- [ ] `deviceCapabilityTier` returns a sane tier on iPhone X (Low) and a high tier on A15 (Commit 3).
- [ ] Quality + target-resolution applied per tier; iOS Vision input downscaled; lag reduced on the X (Commit 4).
- [ ] `bun run check`, `bun run check:shaders`, `bun run check:android` all green; iOS EAS build succeeds.
- [ ] Plan file deleted (Inspector Gadget Rule).
