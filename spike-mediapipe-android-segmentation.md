# Spike: MediaPipe Tasks segmenter on Android (replace MLKit)

**Status:** Draft
**Scope:** subsystem
**Date:** 2026-05-25
**Last reviewed:** 2026-05-25
**Context:** MLKit selfie segmentation is at its architectural ceiling on Android (fixed ~256 model, grabs bright open backgrounds), while MediaPipe selfie segmentation runs well in-browser on the *same* Android device. Swap the segmenter to MediaPipe Tasks and decide go/no-go on device.

## Goal

MLKit's selfie model is fixed at a 256×256 input tensor and, on open/bright framing, misclassifies background (the "ceiling grab"); no config knob fixes it. On-device evidence is decisive: the Volcomix MediaPipe virtual-background demo, run in a browser on the *same* Android phone at comparable framing, segments cleanly where our MLKit-native path does not. This spike replaces **only the Android segmenter** — MLKit `SelfieSegmenter` → MediaPipe Tasks `ImageSegmenter` — behind our existing GL downsample → worker → EMA → composite pipeline, which is already proven (our web composite beats Volcomix). Done looks like: an EAS Android build where background replacement matches web quality on device, with the same transforms/blur still correct; or a clear, evidenced no-go. Secondary prize: MediaPipe on Android (web already uses it) makes web a reliable predictor of native, ending per-platform mask whack-a-mole.

## Domain context

- **Async worker-pull mask pattern.** `Mask.kt` runs segmentation on a single `HandlerThread`, one in-flight at a time (`isProcessing` gate, keep-only-latest via `pendingMaskBitmap`). The GL thread renders at camera rate and samples the last completed mask. This stays.
- **The GL→Bitmap bridge.** Each cycle we GL-downsample the upright "original" to `targetShortSide` and `glReadPixels` into an upright `Bitmap`, fed to the segmenter. The bitmap is already display-upright, so we pass rotation 0. Keeping this bridge is what avoids orientation churn: MediaPipe sees the exact input MLKit did.
- **Confidence vs category mask.** MLKit gave a foreground-confidence `FloatBuffer`. MediaPipe `ImageSegmenter` can emit `outputConfidenceMasks` (float [0,1] per category) or `outputCategoryMask` (uint8 winning class). We want confidence (drop-in for our existing float→grayscale pack + EMA + smoothstep).
- **Single-normalization orientation.** Orientation is fixed once at ingest; the segmenter must not re-introduce rotation. We feed the upright bitmap with no rotation, so the mask lands upright like today.
- **EMA + composite are downstream and untouched.** The temporal smoothing, mask texture upload, and `composite.frag` (`smoothstep` threshold, cover-fit) all consume a grayscale mask bitmap and do not care which model produced it.

## Current surface area

| File | Role | Touched? |
|------|------|----------|
| `android/build.gradle` | deps (`com.google.mlkit:segmentation-selfie`) | add `tasks-vision`; remove MLKit on go |
| `android/src/main/assets/` | bundled assets (backgrounds) | add `selfie_segmenter.tflite` |
| `android/.../segmentation/Mask.kt` | MLKit `Segmenter`, worker, mask read | swap segmenter + process call + mask read |
| `android/.../EffectTuning.kt` | `targetShortSide` (256 floor), threshold/hardness | unchanged (MediaPipe also ~256-native) |
| `android/.../effects/{BackgroundImageFactory,BlurFactory}.kt` | composite consumers of the mask texture | unchanged (grayscale-mask contract) |
| iOS / web | Vision / MediaPipe-web | **OUT OF SCOPE** — do not touch |

## File structure: after

**Legend:** `+` added, `~` modified

```
android/
  build.gradle                                  ~ + tasks-vision dep
  src/main/assets/
    selfie_segmenter.tflite                     + bundled MediaPipe model (~250KB-1MB)
  src/main/java/com/simiancraft/kaleidoscope/
    segmentation/
      Mask.kt                                   ~ ImageSegmenter (VIDEO mode, confidence mask)
```

## Commits

### Commit 1: add the MediaPipe dependency and bundle the model

**Files modified:** `android/build.gradle` — add `implementation("com.google.mediapipe:tasks-vision:<pin a version>")`.
**Files created:** `android/src/main/assets/selfie_segmenter.tflite` — the general selfie segmenter (256×256, the same family web's `@mediapipe/selfie_segmentation` uses; download from the MediaPipe Image Segmenter models page, float16 variant). Keep the MLKit dep for now so the tree stays buildable mid-spike.

**Gate:** `JAVA_HOME=…/java-17 bun run check:android` compiles; the `.tflite` is present in the AAR assets.

### Commit 2: swap the segmenter in Mask.kt to MediaPipe ImageSegmenter

**Files rewritten:** `android/.../segmentation/Mask.kt`
- Replace `Segmentation.getClient(SelfieSegmenterOptions…)` with an `ImageSegmenter.createFromOptions` built from `BaseOptions.setModelAssetPath("selfie_segmenter.tflite")` (+ `.setDelegate(GPU)` if available), `RunningMode.VIDEO`, `.setOutputConfidenceMasks(true)`, `.setOutputCategoryMask(false)`.
- In `runSegmentation`, build an `MPImage` via `BitmapImageBuilder(inputBmp).build()` and call the **blocking** `segmenter.segmentForVideo(mpImage, SystemClock.uptimeMillis())` on the worker (mirrors the old `Tasks.await`). Read the foreground confidence mask (the person-class `MPImage` → its `FloatBuffer`); pack to grayscale exactly as today.
- Keep EVERYTHING else: the downsample/readback, the `isProcessing`/keep-latest backpressure, the EMA, the upload, the composite. Reuse the segmenter for the instance lifetime.

**Gate:** `check:android` compiles; mask bitmap dims are read from the returned mask (not assumed). Confirm we pull the correct confidence-mask index for "foreground/person."

### Commit 3: build and evaluate on device (the go/no-go)

**Files modified:** `demo/app.config.js` — bump version. Push; EAS Android build; install (confirm the on-screen sha).

**Gate (go/no-go criteria, judged on device at NORMAL framing — eye level, subject filling the frame — and at the hostile ceiling framing):**
- **GO if:** background replacement on Android visibly approaches web quality (clean torso/arms, the ceiling grab substantially reduced), transforms (flip/rotate) and blur remain correct, and there's no major FPS regression vs MLKit.
- **NO-GO if:** quality is not meaningfully better than the best MLKit config (256 + 0.9/0.9), or FPS is unacceptable, or it introduces orientation/mask defects the bitmap-bridge was supposed to prevent.

### Commit 4a: GO — finalize

Remove the MLKit dependency and `SelfieSegmenter` imports; (optional) test the `selfie_multiclass_256x256.tflite` model for the background class if the general model still grabs; update `PATTERNS.md` / memory to record Android = MediaPipe; consider whether iOS/web standardization is a follow-up plan (separate doc).

**Gate:** full `bun run check` + `check:android`; on-device confirm.

### Commit 4b: NO-GO — revert

`git revert` commits 1–2 (or abandon the branch). Record the negative result and the on-device evidence in memory so we don't re-spike it blindly.

### Commit 5: delete this plan

Self-destruct once the go/no-go is decided and the outcome (4a or 4b) has landed.

## Verification checklist

- [ ] `check:android` green after each of commits 1 and 2.
- [ ] `.tflite` bundled and loaded (no asset-not-found at runtime).
- [ ] Mask reads the correct confidence mask; dims taken from the returned mask.
- [ ] EMA, threshold/hardness knobs, cover-fit composite still function (grayscale-mask contract intact).
- [ ] On-device: transforms + blur unchanged; mask evaluated at both normal and hostile framing.
- [ ] Go/no-go decided with on-device evidence; iOS untouched throughout.

## Answered questions

- **Model first?** General selfie segmenter (apples-to-apples with web). Multiclass is a fallback in Commit 4a if the general model still grabs background.
- **Running mode?** VIDEO (`segmentForVideo`, blocking) — drop-in for our blocking worker; LIVE_STREAM would force a callback restructure for no benefit here.
- **Mask type?** Confidence masks (float), to reuse the existing float→grayscale→EMA→smoothstep path.
- **Input path?** Keep the GL downsample → upright Bitmap → `MPImage`; do NOT switch to feeding `ImageProxy`. This is what keeps orientation unchanged.

## Anti-patterns / scope boundaries

- Do NOT touch iOS (Vision works) or web in this spike. Standardization is a separate, later decision gated on this result.
- Do NOT rebuild the pipeline — only the segmenter guts change. Downsample, backpressure, EMA, and composite stay.
- Do NOT remove the input downsample (the shared optimization). MediaPipe is also ~256-native, so 256 stays the sensible input.

## References

- MediaPipe ImageSegmenter (Android): https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/android
- MediaPipe selfie segmentation models/specs: https://chuoling.github.io/mediapipe/solutions/selfie_segmentation.html
- Live background blurring with MediaPipe (Android): https://farmaker47.medium.com/using-mediapipe-for-live-background-blurring-62c81ca492ec
- MediaPipe repo: https://github.com/google-ai-edge/mediapipe
- On-device evidence: Volcomix virtual-background (MediaPipe) in Android browser — https://volcomix.github.io/virtual-background/
- Our code: `android/.../segmentation/Mask.kt`, `[[project_segmentation_state]]`.
