# Bootstrap react-native-webrtc-kaleidoscope and ship v0.1 (mirror + blur)

**Status:** In progress
**Scope:** cross-stack
**Date:** 2026-05-07
**Last reviewed:** 2026-05-22
**Context:** v0.1 shipped (released as `1.0.0` on `main`): `mirror`, `blur`, and `background-image` work end-to-end on Android and web, with a GLSL→MSL shader pipeline and an Expo config plugin. The one open thread is finishing iOS so the same effects run on a real device through an EAS dev-client build; that is what `feat/ios-effects-impl` closes.

## Goal

Apps using `react-native-webrtc@124+` had no managed-Expo path to live video effects without forking the library or adopting a paid SaaS. This module ships that path: named native frame processors registered at app boot, plus a thin typed JS facade, packaged as an Expo Module with a config plugin.

v0.1 is built and released for Android and web. The remaining work is iOS device integration: the native Metal pipeline exists and transpiles, but the EAS iOS dev-client build must go green, the effects must be verified on a real device, and the iOS-specific mask-UV orientation values (deferred to empirical first-run in `shaders/composite.frag`) must be measured and written down.

Done when `mirror` / `blur` / `background-image` are confirmed working on a real iOS device via an EAS dev-client build, with the iOS mask-UV values recorded in the composite shader.

## Domain context

Five concepts to hold:

1. **`track._setVideoEffects(['name'])`** — undocumented public-but-non-standard API on `MediaStreamTrack` from `react-native-webrtc` (`MediaStreamTrack.ts`). Native side dispatches to a registered processor factory by name. Local tracks only. Plural, chains. iOS clears with `[]`, Android with `null` (see `fix(facade)` commit).
2. **`ProcessorProvider`** — the registry. Android: `com.oney.WebRTCModule.videoEffects.ProcessorProvider.addProcessor(name, factory)`. iOS: `ProcessorProvider.h`, same shape. Registration happens once at app boot, injected by the config plugin.
3. **Expo Modules + config plugin** — the managed-Expo path. Native code autolinks at prebuild; the plugin patches `MainApplication` / `AppDelegate` registration and the iOS Podfile (modular headers, `:path`, deployment target 15.0). No ejection.
4. **Peer dependency, not re-export** — the consumer installs `react-native-webrtc` (or the `@livekit/react-native-webrtc` fork) and this module independently. Native code links against the rn-webrtc libs already in the consumer's build graph.
5. **Cross-platform split** — native (iOS + Android) uses the registry and a shared GLSL→MSL/GLES pipeline. Web uses Insertable Streams (`MediaStreamTrackProcessor` + `MediaStreamTrackGenerator`) + an optional LiveKit `TrackProcessor` adapter. Same JS interface, Metro `.web.ts` resolution swaps the impl. The composite shader is shared across runtimes via one texture-orientation convention.

## Current surface area

Shipped (`main` @ `1.0.0`) and not part of remaining work:

| Area | State |
|---|---|
| JS facade | `src/index.ts` (native), `src/index.web.ts` (web), `src/types.ts`; LiveKit adapter |
| Web effects | `src/web/effects/{mirror,blur,background-image,passthrough}.ts` + Insertable Streams pipeline |
| Android effects | `effects/{Mirror,Blur,BackgroundImage}Factory.kt` + `gpu/` GLES pipeline |
| iOS effects | `effects/{Mirror,Blur,BackgroundImage}Processor.swift` + `gpu/MetalRenderer.swift`, `gpu/ShaderLibrary.swift`, `FrameBridge.swift` |
| Shaders | `shaders/{blur,composite}.frag`, `shaders/passthrough.vert`; `scripts/transpile-shaders.ts` → `ios/.../*.metalsrc` |
| Config plugin | `app.plugin.js` + `plugin/src/withKaleidoscope.ts` (MainApplication/AppDelegate/Podfile) |
| Demo | `demo/` Expo app with effect-tuning panel; EAS dev-client + EAS Update wired |
| OSS hygiene + release | full chromonym/unitforge parity; `semantic-release`; README rewritten to honest platform support |

iOS-specific item still open:

- `shaders/composite.frag` — `uMaskUvScale` / `uMaskUvOffset` carry a comment block instructing that the iOS mask-orientation values be measured empirically on first device run and written down. Web/Android values are set; iOS is not yet confirmed.

## Commits

### ~~Commits 1–14: bootstrap, OSS hygiene, mirror/blur/background-image on Android + web, shader pipeline, config plugin, demo, docs~~ ✅ Shipped (released as `1.0.0`)

All v0.1 scaffolding, OSS-hygiene parity, the three effects on Android and web, the GLSL→SPIR-V→MSL transpilation pipeline, runtime effect controls (sigma / mask hardness / threshold), the Expo config plugin, the in-repo `demo/` app, and the documentation pass landed on `main` and released as `1.0.0`. The implementation also went beyond the original plan (background-image effect, LiveKit fork support, full iOS Metal pipeline, EAS dev-client). History is in `git log`; the per-commit bodies are not reproduced here.

### Commit A: Land the EAS iOS dev-client build fixes 🔶 In progress

**Goal:** A consumer EAS iOS dev-client build of `demo/` succeeds with the module's native effects compiled in.

**Files:** the `fix(ios)` / `fix(eas)` / `fix(plugin)` set fast-forwarded from `fix/eas-ios-builds` (Podfile `:path` + modular headers, WebRTC.framework search path, iOS deployment target 15.0 via plugin and `expo-build-properties`, `.metalsrc` rename to dodge Xcode resource-bundle auto-compile, `didCapture` delegate label, EAS Update wiring, install-cache workaround).

**Gate:** EAS iOS dev-client build completes; the dev client installs and launches on a real device.

### Commit B: Verify effects on a real iOS device and record iOS mask-UV values

**Goal:** Confirm `mirror`, `blur`, and `background-image` render correctly on a real iOS device, and pin the iOS mask orientation.

**Files modified:**
- `shaders/composite.frag` — replace the "verify empirically on first run" comment with the measured iOS `uMaskUvScale` / `uMaskUvOffset` values; re-run `bun run transpile:shaders` so the `.metalsrc` matches.

**Gate:** All three effects visually correct on a real iOS device (mask aligned, background upright, no inversion). `bun run transpile:shaders` clean.

### Commit N: Delete this plan

- Delete `bootstrap-and-ship-v0-1.md`.
- If any convention surfaced here is worth keeping (e.g. the texture-orientation convention), confirm it lives in `PATTERNS.md` first.

**Gate:** `bun run check:knip` and `bun run lint` pass. `git grep -F 'bootstrap-and-ship-v0-1'` returns no results.

## Verification checklist

- [x] `mirror` / `blur` / `background-image` work on Android and web.
- [x] `bun run check:package` passes (publint).
- [x] OSS-hygiene file set matches chromonym/unitforge.
- [x] v0.1 released (`1.0.0` on `main`).
- [ ] EAS iOS dev-client build of `demo/` succeeds (Commit A).
- [ ] `mirror` / `blur` / `background-image` verified on a real iOS device (Commit B).
- [ ] iOS `uMaskUvScale` / `uMaskUvOffset` measured and written into `shaders/composite.frag` (Commit B).
- [ ] Plan file deleted (Inspector Gadget Rule: no orphan plans).

## References

- `react-native-webrtc` PRs #1176 / #1331 / #1681 — frame-processor registry (Android, multi-processor + iOS scaffold, iOS implementation).
- `node_modules/react-native-webrtc/src/MediaStreamTrack.ts` — `_setVideoEffects` JS surface.
- `PATTERNS.md` — texture-orientation convention; durable home for anything extracted from this plan.
- `https://github.com/simiancraft/chromonym` and `https://github.com/simiancraft/unitforge` — quality templates.
