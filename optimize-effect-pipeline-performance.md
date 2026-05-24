# Optimize Effect Pipeline Performance

**Status:** In progress
**Scope:** cross-stack
**Date:** 2026-05-23
**Last reviewed:** 2026-05-23
**Context:** The per-frame blur path runs at full resolution with a 17-fetch kernel and a per-frame CPU↔GPU sync on every platform; tightening it is what makes the library "worth a download" without adopting a heavier matting model (RVM/MODNet/PaddleSeg were evaluated and rejected on licensing and runtime-weight grounds). On web the render also blocks on the segmenter every frame (R6).

## Goal

The blur effect spends far more GPU than it needs to: it blurs at full capture resolution (R1), reads 17 texels per pixel per pass with a discrete kernel (R2), and stalls the capture thread waiting for the GPU every frame (R3). We keep the exact current functionality and architecture (single-source GLSL transpiled to MSL/Kotlin/web, thin native hosts, all pixel work on the GPU) and make three changes: blur at quarter-area resolution, switch to a linear-sampled lower-tap kernel, and pipeline the frame so CPU and GPU overlap. Done looks like: identical visual output, measured per-pass GPU timing on all three platforms, and materially higher sustained FPS on device, with the blur ping-pong buffers downscaled, `blur.frag` using bilinear paired taps, and the per-frame `glFinish`/`waitUntilCompleted` replaced by returning the previous frame's completed output.

## Domain context

1. **The blur path.** Per frame: camera (OES texture on Android, NV12 `CVPixelBuffer` on iOS, `VideoFrame` on web) → "original 2D" copy → two separable Gaussian passes (ping-pong FBO/texture) → composite(original, blurred, mask) → output buffer handed to WebRTC.
2. **Single-source shaders.** `shaders/*.frag` is canonical. `bun run build:shaders` transpiles to iOS `.metalsrc` (bundle resource, compiled at runtime), code-generates Android `ShadersGenerated.kt` (compiled into the native lib), and web `shaders.generated.ts` (JS string). Any shader change requires a native rebuild on iOS/Android; `check:shaders` gates artifact drift.
3. **Separable blur is already two-pass.** `blur.frag` is a 1D blur invoked twice (H with `uAxis=(1/w,0)`, V with `(0,1/h)`). The separation already exists; this plan does not add it. Cost = output cells × fetches per cell. R1 cuts cells; R2 cuts fetches.
4. **Synchronous processor contract.** `VideoFrameProcessor.process` (Android) and `capturer:didCaptureVideoFrame:` (iOS) must *return* the finished frame, which forces a per-frame GPU wait. Pipelining means returning the *previous* frame's output (one frame of added latency) so the current frame's GPU work overlaps the next frame's CPU work.
5. **Runtime sigma stays runtime.** Kernel weights are computed on the CPU from `EffectTuning.blurSigma` when sigma changes (`ensureKernel`/`BlurKernel.ensure`/`blurKernel`). This plan keeps that; it does not hardcode weights.

## Current surface area

| File | Role | Phases touching it |
|------|------|--------------------|
| `shaders/blur.frag` | Canonical separable blur kernel | 2 |
| `scripts/build-shaders.ts` | Codegen/transpile (run, not edited) | 2 |
| `src/web/effects/blur.ts` | Web blur GL pipeline | 0, 1, 2 |
| `src/web/blur-kernel.ts` | Web kernel math (`computeBlurKernel`) | 2 |
| `test/blur-kernel.test.ts` | Kernel unit tests (re-baseline for new kernel) | 2 |
| `src/web/effects/background-image.ts` | Web composite-only effect | 5 |
| `android/.../effects/BlurFactory.kt` | Android blur pipeline + `ensureKernel` | 0, 1, 2, 3 |
| `android/.../effects/BackgroundImageFactory.kt` | Android composite-only effect | 3 |
| `android/.../gpu/Fbo.kt` | FBO+texture pair | 1, 3 |
| `ios/.../effects/BlurProcessor.swift` | iOS blur pipeline | 0, 1, 2, 3 |
| `ios/.../gpu/MetalRenderer.swift` | Metal renderer, pools, `BlurKernel` | 0, 1, 2, 3 |
| `ios/.../effects/BackgroundImageProcessor.swift` | iOS composite-only effect | 3 |

This plan modifies files in place (instrumentation is inline behind a debug flag; no files created, moved, or deleted), so before/after trees are omitted.

## Commits

### Commit 1: Add per-pass GPU timing behind a debug flag

**Goal:** Measure each pass's GPU cost on every platform so the device-test phase has ground-truth numbers, not estimates.

#### ✅ Commit 1a: web timing (done: `83be5aa`)
**Files rewritten:**
- `src/web/effects/blur.ts`: wrap the H, V, and composite draws with `EXT_disjoint_timer_query_webgl2` (fallback to `performance.now()` deltas), logged only when a debug flag is set. Cache `getUniformLocation` lookups at link time while here.

**Gate:** `bun run check` passes.

#### Commit 1b: Android timing
**Files rewritten:**
- `android/.../effects/BlurFactory.kt`: bracket each pass with `glBeginQuery(GL_TIME_ELAPSED_EXT)`/`glEndQuery`, read results a frame late, log under a debug flag.

**Gate:** `bun run check:android` compiles.

#### Commit 1c: iOS timing
**Files rewritten:**
- `ios/.../effects/BlurProcessor.swift`: read `commandBuffer.gpuStartTime`/`gpuEndTime` in the completion path; log under a debug flag.
- `ios/.../gpu/TextureBridge.swift`: time the per-frame `ciContext.render` ingest separately. This number is the sole input to the deferred decision about the CoreImage→YUV-in-shader swap (see Scope boundaries).

**Gate:** iOS demo builds (`bun run demo:ios` / EAS).

### Commit 2: Blur at quarter-area resolution (R1)

**Goal:** Allocate the blur ping-pong buffers at half each axis (quarter the pixels), floored so the short side never drops below 256px; the composite's existing `LINEAR` sampler upscales the blurred background for free.

Shared rule: `shortTarget = max(256, round(min(w,h) * 0.5)); scale = shortTarget / min(w,h); downW = round(w*scale), downH = round(h*scale)`. Pass 1 samples the full-res original into the downscaled `blurA` (bilinear minification + blur in one step); `uAxis` is set relative to the downscaled dims. Pass 2 stays within the downscaled buffers. Composite samples the downscaled `blurB` unchanged.

#### ✅ Commit 2a: web R1 (done: `0ab3f02`)
**Files rewritten:**
- `src/web/effects/blur.ts`: size `blurA`/`blurB` textures + FBOs at `downW×downH`; set `uAxis` to `1/downW`, `1/downH`.

**Gate:** `bun run check` passes; blur visually matches pre-change.

#### Commit 2b: Android R1
**Files rewritten:**
- `android/.../effects/BlurFactory.kt`: allocate `blurAFbo`/`blurBFbo` at `downW×downH` in `ensureIntermediates`; viewport and `uAxis` follow.

**Gate:** `bun run check:android` compiles; blur visually matches.

#### Commit 2c: iOS R1
**Files rewritten:**
- `ios/.../gpu/MetalRenderer.swift`: `blurPingPong` allocates at `downW×downH`; `encodeBlurPass` axis follows.

**Gate:** iOS demo builds; blur visually matches.

### Commit 3: Linear-sampled, reduced-tap blur kernel (R2)

**Goal:** Replace the discrete 9-weight / 17-fetch kernel with a bilinear linear-sampled kernel at ~5 effective taps (3 fetches), targeting parity with the current look (R1's downscale already widens the effective radius). Keep sigma runtime-computed; do not hardcode weights.

This is one cross-platform commit because the shader is shared and the host kernel math must match it in lockstep.

**Files rewritten:**
- `shaders/blur.frag`: rewrite the tap loop to sample center + N fractional-offset pairs (bilinear two-texels-per-fetch); `N` = fetch count for ~5 effective taps, with room to bump to ~7 if quality requires.
- `android/.../effects/BlurFactory.kt` (`ensureKernel`), `ios/.../gpu/MetalRenderer.swift` (`BlurKernel.ensure`), `src/web/blur-kernel.ts` (`computeBlurKernel`): compute Gaussian weights for the target radius, then combine adjacent tap pairs into fractional offsets + summed weights; upload as `uOffsets`/`uWeights`. Normalize to sum 1.
- `test/blur-kernel.test.ts`: re-baseline expected weights/offsets for the linear-sampled kernel.

**Files regenerated (by `bun run build:shaders`, committed):**
- `android/.../gpu/ShadersGenerated.kt`, `src/web/shaders.generated.ts`, `ios/.../shaders/blur.metalsrc`.

**Gate:** `bun run check:shaders` clean; `bun run check` passes; `bun run check:android` compiles; iOS demo builds; blur visually matches at the target sigma values.

### Commit 4: Pipeline the frame to overlap CPU and GPU (R3)

**Goal:** Stop blocking the capture thread on the GPU every frame. Submit the current frame's work without waiting and return the previous frame's completed output (one frame of added latency). Apply to both blur and background-image processors, which share the stall.

#### Commit 4a: iOS pipelining
**Files rewritten:**
- `ios/.../gpu/MetalRenderer.swift`: add a `dispatch_semaphore(value: maxFramesInFlight)`; `wait()` before encoding, `signal()` in `commandBuffer.addCompletedHandler`.
- `ios/.../effects/BlurProcessor.swift` and `ios/.../effects/BackgroundImageProcessor.swift`: remove `waitUntilCompleted`; hold the last completed output buffer and return it, committing the current buffer asynchronously. The `CVPixelBufferPool(min: 3)` already backs this.

**Gate:** iOS demo builds; effect output correct; measured GPU/CPU overlap via Commit 1c timing.

#### Commit 4b: Android pipelining
**Files rewritten:**
- `android/.../effects/BlurFactory.kt` and `android/.../effects/BackgroundImageFactory.kt`: replace the per-frame `Fbo(w,h)` output allocation with a small ring (3) of reusable output textures; `glFenceSync` after composite; return the previous frame's output once its fence has signaled; remove `glFinish`.
- `android/.../gpu/Fbo.kt`: support detaching/reusing the color texture across frames if needed for the ring.

**Note:** the output-texture ring is the Android half of R4 (allocation churn); pipelining cannot work without it, so it lands here.

**Gate:** `bun run check:android` compiles; effect output correct; no texture leak (release callbacks fire); measured overlap via Commit 1b timing.

### ✅ Commit 5: Hoist the static background upload out of the web per-frame loop (R5) (done: `7f0bdf2`)

**Goal:** The web background-image effect re-uploads the static background texture every frame; upload it once.

**Files rewritten:**
- `src/web/effects/background-image.ts`: move the `uploadTexture(..., textures.background, ...)` call out of the per-frame transform into state creation.

**Gate:** `bun run check` passes; background-image output unchanged.

### ✅ Commit 6: Decouple web segmentation from the render path (R6) (done: `d89c8ee`)

**Goal:** Web `await`s MediaPipe every frame, gating render at segmentation rate so R1/R2's cheaper GPU work is invisible end-to-end. Break the dependency: keep a shared latest-mask cache, draw every frame with it, run segmentation fire-and-forget, update the cache on completion. The mask becomes ~1 frame stale (matches native). Single event loop, no Web Worker; JS-only, no native rebuild.

**Files rewritten:**
- `src/web/segmenter.ts`: register `onResults` once at load to store the latest `SegmenterResults` and clear an in-flight flag; expose `latestMask(): SegmenterResults | null` (non-blocking read) and `requestMaskIfIdle(image)` that calls `send` without the caller awaiting, only when not already in flight. Mirrors Android `Mask.kt` (`isProcessing` + cached bitmap) and iOS `Segmenter.swift` (`inFlight` + `lastMask`).
- `src/web/effects/blur.ts`: remove the `await new Promise(... onResults/send ...)` at the transform's segmentation step; instead `requestMaskIfIdle(inputCanvas)`, read `latestMask()`, and if null forward the original frame (preserve timestamp, no composite) matching native's `-1` fall-through; otherwise upload + composite as today.
- `src/web/effects/background-image.ts`: same restructure.

**Gate:** `bun run check` passes; web effects render at camera rate with the mask refreshing asynchronously; the first frames before any mask completes forward the original.

### Commit 7: Delete this plan

- Delete `optimize-effect-pipeline-performance.md`.
- If any reusable convention emerged (e.g. the downscale-factor rule), extract it to `PATTERNS.md` in a prior commit first.

**Gate:** `bun run check` passes; repo contains no references to the plan file.

## Verification checklist

- [ ] Per-pass GPU timing logs on web, Android, and iOS (Commit 1).
- [ ] Blur ping-pong buffers allocate at quarter area with a 256px floor (Commit 2).
- [ ] `blur.frag` uses linear-sampled paired taps; `check:shaders` clean; sigma still runtime-tunable (Commit 3).
- [ ] No per-frame `glFinish`/`waitUntilCompleted`; previous-frame output returned; no texture leaks (Commit 4).
- [x] Web background upload happens once, not per frame (Commit 5).
- [x] Web segmentation decoupled: render reads a cached mask and never awaits; mask ~1 frame stale (Commit 6).
- [ ] `bun run check`, `bun run check:shaders`, `bun run check:android` all green.
- [ ] On-device FPS measured before/after on all three platforms; blur look unchanged at dialed-in sigma.
- [ ] Plan file deleted (Inspector Gadget Rule: no orphan plans).

## Scope boundaries (explicitly not in this plan)

- **iOS CoreImage→YUV-in-shader ingest swap.** `TextureBridge.swift` uses CoreImage for the NV12→RGB ingest as a *deliberate, documented* choice: CoreImage reads the buffer's `YCbCrMatrix`/`ColorPrimaries` attachments and picks the correct conversion, and its `CIContext` is created once (the per-frame-context perf failure is already avoided). It is the iOS analogue of Android's necessary OES→2D pass. Replacing it risks a subtly wrong color matrix. Out of scope unless Phase 0 timing (Commit 1c) shows `ciContext.render` is a meaningful slice of the iOS frame budget, and then only with explicit buffer-attachment handling plus a CoreImage fallback.
- **Web 2D-canvas input staging removal.** Entangled with MediaPipe's canvas input and the `flipY` requirement; revisit only if Phase 0 shows the staging copy is significant.
- **Android mask `Bitmap`/`IntArray` pooling.** Intermittent (segmentation kickoff, ~10–20 Hz) and off the render critical path; not worth the complexity.
- **R7 precision/bandwidth.** Largely subsumed by R1 (downscaling the blur buffers already cuts their bandwidth ~4×) and the shaders are already `mediump`. The one remaining nugget — uploading the mask as single-channel R8 instead of RGBA8 on web/Android — is deferred: small absolute saving (the mask is low-res) and fiddly (MediaPipe returns RGBA, MLKit packs to ARGB). Revisit only if Phase 0 flags mask upload bandwidth.

## References

- `PATTERNS.md` — texture orientation convention, platform split rule.
- Memory: `project_perf_rubric` (the seven-axis rubric this plan implements R1/R2/R3 from), `project_dialed_in_web_tuning` (sigma values to verify against).
- [MobiDev: real-time background blur](https://mobidev.biz/blog/background-removal-and-blur-in-a-real-time-video) — downsample-before-model rationale.
- [Apple Metal Best Practices: Triple Buffering](https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/MTLBestPracticesGuide/TripleBuffering.html) — the semaphore pattern for Commit 4a.
