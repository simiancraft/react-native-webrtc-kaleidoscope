# Integration testing

How this library is verified end to end: **locally and automatically, across web,
Android, and iOS, before any cloud build or physical device.** The goal is to catch
breakage where it is cheapest and fastest to see. A cloud (EAS) build costs money and is
slow, not just the build minutes but the manual install-and-poke loop after it, so it
must never be the place a reference error or a missing control is first discovered.
Local browser and emulator runs are free and instant; spend them first.

## The order: least-likely-to-break first

Run the platforms in this order, escalating from the most forgiving runtime to the most
fragile. **Stop and fix at the first failure.** The same break costs minutes on web,
hours on a device after a cloud build.

1. **Web (Playwright).** The most forgiving environment, and the reference for *what the
   app should do*. The browser WebGL pipeline tolerates the most, so a composite that is
   wrong everywhere is usually wrong here too, and this is the cheapest place to see it.
   Drive every control headlessly; spot-check with vision.

2. **Android (Maestro + a local KVM emulator).** Second, for three reasons:
   - the emulator can be **fully instrumented**, including a real segmentable person in
     the camera, so the mask and compositing path is testable locally;
   - feedback is **instant and local** — there is no cloud-build queue standing between
     you and the discovery that the native build is broken;
   - it exercises the shader codegen pipeline, and **GLSL → Android GL is far simpler than
     GLSL → Metal**, so a clean Android build-and-run is a strong predictor that iOS will
     at least build and come up. iOS has its own complexities, but something that runs
     without a red-screen crash on Android usually launches on iOS.

   **Commit once web and Android are both green.**

3. **iOS (simulator, on macOS).** A dedicated agent drives the iOS simulator on a Mac. It
   validates the Metal-transpiled build and the UI. It cannot instrument the camera the
   way the Android emulator can, so its mask coverage is limited; treat it as a
   build-and-runs + smoke gate, not a mask pass.

4. **EAS cloud build + physical devices — last, and only after all three local passes are
   green.** This is the real-world pass: true FPS, the real camera, real GPU drivers. It
   is the slow, billed step, so it is reserved for fidelity and performance, never for
   shaking out errors local tests would have caught. Physical coverage escalates too: a
   low-end and a mid-range handset first, then a large / foldable form factor, and tablets
   last. There is no reason to touch hardware before everything runs locally; burning
   cloud builds to chase reference errors is the waste this whole process exists to avoid.

## The phases (run on each platform, in order)

Every platform goes through the same escalating phases. Earlier phases are cheaper and
gate the later ones.

### Phase 1 — Build + load

It compiles, installs, and launches without crashing. The cheapest gate; a broken build
or a crash-on-launch stops here, before anything else is worth trying.

### Phase 2 — Smoke test (automated, no vision)

Drive every control and assert structural correctness mechanically. None of this needs a
human eye; it is all verifiable from the UI tree plus logcat / the browser console:

- **Every preset is selectable** without a crash, and the picker menu lists **every item
  in the preset book** — the on-screen set matches the book (count and ids). A menu that
  silently drops presets is a failure.
- **Every slider is driven fully to both extremes**, all the way down *and* all the way
  up. The extremes are the test, not the middle: a slider at `0` has crashed before, so
  min and max are the cases that matter.
- **Thumbnails render** for presets that declare one; presets without a thumbnail render
  the correct recessed / placeholder shape, not a broken tile.
- **Each shader exposes its controls** — the right knobs appear for each effect.
- **No crash / ANR / GL or console error** throughout. A malfunctioning shader surfaces
  here automatically, the same way on web, Android, and iOS.

A smoke test is the automated sweep of all of the above. It is the workhorse: it catches
the large majority of breakage without a single screenshot.

### Phase 3 — Mask / composite spot-check (vision, one-of-each)

Only after smoke is green. This is where you confirm the composites actually *look* right
through the segmentation mask — something smoke cannot see. It needs screenshots and
vision, so it is deliberately a **representative sample, one of each kind**, not
exhaustive (smoke already covered breadth):

- **One catalog background image and one user-provided background image.** A catalog image
  and a consumer-supplied image resolve through different paths, so testing one of each
  exercises both. Confirm the background image **actually appears in the composite** and
  that its picker **thumbnail shows the image**.
- **A preset with no thumbnail:** confirm the tile correctly shows no image but still
  renders the right shape.
- **One of each shader family:** one image-world composite, one blur, one generative
  (e.g. plasma).

The point is to catch a composite that passes smoke but masks or composites incorrectly:
the person dropped, the background not replaced, a raw camera frame with no compositing.
Checking a screenshot with vision is far cheaper than a human eyeballing every composite
by hand after a slow cloud build, which is exactly the manual labor this phase front-loads
into an automated, local step.

Today this automated vision pass runs on **Android** (the emulator can put a real subject
in the camera; see *Canonical tooling*). A web (Playwright) mask-test path is **not set up
yet** and would be a worthwhile addition — wiring a segmentable subject into the
Playwright fake-camera so the same one-of-each composite check runs on web would push mask
coverage one tier earlier.

## Canonical tooling

The Android bring-up (KVM AVD, headless boot), Maestro driving, logcat / screenshot
assertion, and the camera + mask setup are published as reusable skills and agents:

**https://github.com/simiancraft/simiancraft-skills**

Use those as the canonical reference for the Android verification loop (the emulator
harness and the camera / mask-testing specialization). iOS-simulator and Playwright skills
may be published there over time. Prefer them over re-deriving the setup by hand.

## Camera framing for the mask pass

The app reads the segmentation subject from the camera, so the camera needs a real,
segmentable person or the mask has nothing to find. A recent Android emulator can feed a
still image straight into the back camera:

```
-camera-back imagefile:<abs-path-to>/integration/fixtures/person-framed.png
```

Feed **`fixtures/person-framed.png`**, not a bare cutout. The emulator's
imagefile-to-sensor path does **not** present the image 1:1; it crops and shifts, so a
subject centered in the source lands off to the right with the head clipped.
`person-framed.png` is pre-compensated. The framing that lands the subject centered and
fully in frame (the "great scale"):

- **Frame:** 9:16 portrait (e.g. 1080 x 1920).
- **Subject height:** ~0.42 of the frame height (head-to-feet, not a close-up).
- **Subject center:** x = **0.25 W**, y = **0.58 H**. The left-quarter x is deliberate; it
  cancels the sensor path's rightward shift so the subject reads centered on screen.
- **Background:** opaque and contrasting with the subject (a light neutral gray works);
  segmentation needs a clean figure/ground split, and the background is what gets replaced.

`fixtures/person.png` is the bare full-body subject (transparent background) to recompose
from. These offsets are emulator/AVD/version specific: feed the image, select no effect to
see the raw camera preview, screenshot it, and nudge the subject's x-center until it reads
centered before trusting a run.

## Known emulator failure modes (read before blaming the library)

All three of these were hit on real harness passes; each one mimics a library bug while
being an environment or lifecycle stall. Frame-flow first, shaders second: the composite
renders **per delivered camera frame**, so anything that stops camera delivery freezes the
output, and on a STATIC imagefile feed every static effect still "looks right"; the only
tell is a time-driven generative that stops moving.

- **A frozen generative is a frame-flow symptom until proven otherwise.** A pass reported
  `corporate-blobs` bit-identical for 300+ frames on swangle (#49); the same composite,
  same uniforms, same system image, and same GPU mode animates at the camera's ~10 fps on
  the library demo, with `EglRenderer ... Frames received: 41 ... Render fps: 10.1` in
  logcat. Before suspecting the per-frame `uTime` path, grep logcat for the periodic
  `EglRenderer` stats line: a healthy run receives frames continuously; a stalled run
  shows `Frames received: 0` windows while the UI still looks plausible.
- **The `imagefile:` camera silently dies on awkward paths.** Feeding
  `-camera-back imagefile:<path>` from a long worktree path containing `+`
  (`.claude/worktrees/fix+plugin-.../integration/fixtures/person-framed.png`) made the
  guest HAL enumerate ZERO cameras: qemu lists the camera with an empty `framedims`, the
  factory logs `0 cameras are being emulated`, and getUserMedia fails with "Unable to
  identify a suitable camera". The same fixture copied to `/tmp/person-framed.png` works.
  Always feed the camera from a short, plain path, and gate bring-up on
  `dumpsys media.camera` reporting a nonzero device count before driving the app.
- **Background/resume stalls frame delivery (#52).** Sending the app to Home and resuming
  leaves the preview black with `Frames received: 0`; preset changes do not recover, a
  cold app restart does. Maestro flows that tap visible text can trigger this by accident:
  a category chip named "Home" sits near the system Home button.

## Snapshots

Write run output (screenshots) under `snapshots/<platform>/<run>/`, which is git-ignored,
following the existing folder naming. Driving the UI by stable control ids and taking a
screenshot after each selection makes the mask pass repeatable and reviewable.
</content>
</invoke>
