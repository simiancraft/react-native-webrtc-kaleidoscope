# Integration testing

Mechanical, pre-device verification for this library's **native** runtime (Android
today, iOS later). The web pipeline has its own browser snapshot flow; this folder is
for the native path, which a browser cannot exercise.

## The rule

Before any physical-device test or cloud / EAS build, verify the native build **locally
and mechanically**:

1. **Build a local debug APK** from the prebuilt native project (your prebuild plus a
   Gradle `assembleDebug`, or your toolchain's equivalent). Do not let a cloud build be
   the first thing to discover a broken local build.
2. **Drive every control** on a local emulator: every background and shader tile, every
   blur and plasma preset, the flip and rotate transforms, and the mask hardness and
   threshold sliders. Buttons and sliders both.
3. **Assert two things per control:** the app does not crash (watch logcat for
   `FATAL EXCEPTION`, `ANR`, `UnsatisfiedLink`, and GL errors), and the effect actually
   renders.
4. **Verify the mask.** Segmentation must keep the person and replace, blur, or composite
   the background. A background swap that drops the person, or a raw camera frame with no
   compositing, is a failure. Masking is tested *in addition to* every other control, not
   instead of it.

Only once the local mechanical pass is green do you move to a real device or cloud build.
Real camera fidelity and true FPS are device concerns; everything else (no-crash, wiring,
control behavior, mask presence) is verifiable locally and should be.

## Emulator and camera

Use a headless local emulator; on Linux, a KVM-accelerated one is the fast path. The app
reads the segmentation subject from the camera, so the camera needs a real, segmentable
person, or the mask has nothing to find.

A recent Android emulator (>= 36.6.4) can feed a still image straight into the camera:

```
-camera-back imagefile:<abs-path-to>/integration/fixtures/person.png
```

`fixtures/person.png` is a provided, well-framed test subject. A good starting framing is a
single person, upper body, centered, filling roughly 40% of the frame height on a
contrasting background; it segments cleanly and leaves obvious background to replace.

Driving the UI by on-screen control labels and taking a screenshot after each makes the
sweep repeatable and reviewable. Write run output under `snapshots/<platform>/<run>/`,
which is git-ignored.

## Later

A dedicated, runnable harness for this will be published; when it is, this README will
point at it. Until then the contract above stands: the native build gets a mechanical
local pass, masking included, before any device testing.
