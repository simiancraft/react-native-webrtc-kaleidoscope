# react-native-webrtc-kaleidoscope — Agent Instructions

A managed-Expo-friendly Expo Module that registers a video frame processor with `react-native-webrtc` and exposes a typed JS facade. Every effect is one shape: a **composite** of layers (see Vocabulary). The geometric transforms (flip-x/flip-y/rotate-cw/rotate-ccw) are the only separately-registered ops; everything else; blur, bundled images, procedural shaders, the masked person; is a layer in a composite stack.

## Vocabulary (canonical; the code speaks ONLY these words)

This kit was unified so that every effect is one shape: a **composite**. The older "one effect at a time" framing (a separate `blur`, a `background-image`, a `scene`) is gone. When you touch any effect, shader, asset, or the native bridge, use exactly these nouns; the types, the asset dirs, the native classes, and the wire all agree on them, and a stray `scene` / `plate` / `background-image` is a bug to fix, not a synonym to keep.

| Term | Meaning | Where it lives |
|------|---------|----------------|
| **composite** | The one registered native effect: a stack of layers rendered back-to-front into the output frame. Every preset is a composite; "one effect" is a composite with a single layer. | registered effect string `"composite"`; `CompositeFactory` / `CompositeProcessor` (native); `makeComposite` (web); `CompositeSpec` (types) |
| **layer** | One entry in a composite's stack: `{ id, shader, target?, blend?, source?/uniforms? }`, rendered in array order. | `LayerSpec` (types); `CompositeLayer` (native) |
| **id** | A layer's stable address within its composite. `kaleidoscope(presetId, patches)` addresses layers by `id` and merges partial uniforms over the baked values. | `LayerSpec.id`, `LayerPatch.id` |
| **shader** | What a layer draws: a GLSL effect basename (`clouds`, `plasma`, `godrays`, `fireflies`, `blur`), or one of the two built-ins `image` (a bundled plate) and `direct` (the raw camera). | `LayerSpec.shader` |
| **target** | Where a layer renders: `background` (fullscreen) or `subject` (mask-stenciled to the person). Defaults to `background`. | `LayerSpec.target` |
| **blend** | How a layer composites over those below it: opaque base, `normal` (alpha-over), or `additive`. | `LayerSpec.blend` |
| **image** | A bundled WebP plate an `image` layer resolves by id. Source folder `images/<name>/`; native bundle dir `assets/images/` (Android) and the app-bundle root (iOS). NOT "scene-plate", NOT "background". | `images/` (source); `assets/images/` (native); `shader: 'image'` |
| **shaders/ · images/ · composites/** | The three root library noun-folders, one folder per item. `shaders/<name>/` is the canonical GLSL (single source, codegen'd to every platform); `images/<name>/` is the plates; `composites/<name>/` is the packaged composite defs + thumbnails. | repo root |

The native channel that carries a composite's layer stack across the bridge is the Expo Function `setCompositeLayers` (same name on JS, Android, and iOS; a parity test enforces the match); the JS that serializes the stack is `serializeCompositeLayers`. The per-layer Metal sources are `composite-image`, `composite-subject`, `composite-blur`, etc.

Words we deleted and must not reappear in code: `scene`, `scene-plate(s)`, `background-image` (as an effect name), `mirror` (the transform-op set replaced it). If one shows up, it is stale; rename it.

## Status

Pre-1.0, active development. The transform, `blur`, and `background-image` effects ship on web, Android, and iOS. Durable conventions live in `PATTERNS.md`.

## Orientation, the composite, and the mask — READ THIS before changing any effect, shader, or the ingest

This architecture was hard-won over a long cross-platform debugging arc, and a "correction" to it will look like a local win while silently breaking the other platform. Do not undo these without understanding them; the detail and the same rules live at the code site in the `Ingest.{kt,swift}` and `Orientation.{kt,swift}` headers and in [PATTERNS.md](./PATTERNS.md).

1. **Orientation is normalized exactly once, upstream, at the ingest.** `android/.../gpu/Ingest.kt` and `ios/.../gpu/Ingest.swift` fold the camera's display rotation (and, on iOS, the front-camera selfie mirror) into the camera→texture step, so the "original" texture every effect samples is already DISPLAY-UPRIGHT and non-mirrored. Effects then emit `rotation 0`. There is no per-effect orientation logic downstream, and there must not be.

2. **Never add a flip, rotation, or V-flip inside an effect or shader to "make it look right."** If the frame is rotated or mirrored wrong, it is an INGEST problem; fix it there, one sign-flip per symptom per platform. Android: `Ingest.ROTATION_DIRECTION` only — the front-camera selfie mirror is baked into the camera `transformMatrix`, so there is no separate Android mirror knob. iOS: `Ingest.ROTATION_DIRECTION` plus `Ingest.INGEST_MIRROR_X` (the front-camera buffer arrives mirrored, so iOS folds in a de-mirror). Per-effect corrections are the "orientation cascade" this design exists to kill; each one breaks another effect.

3. **Web is the orientation reference.** The web pipeline (canvas, display-space) is correct by construction; native matches it. `Orientation.{kt,swift}` are pure SCREEN-SPACE matrices (flip-x = negate U, flip-y = negate V, rotate = axis swap) and do NOT read `frame.rotation`; the ingest already handled rotation.

4. **The composite's V-flip terms are platform-specific render-pass / texture-origin PARITY, not camera orientation. Do not unify them or zero them out.** The vertical flip some composite paths need (from the odd ping-pong pass count and each platform's texture-origin convention) lands on a DIFFERENT uniform per platform: **iOS blur** sets `uBgUvScale=(1,-1)`; **web blur and web background** set `uMaskUvScale=(1,-1)`; **Android** sets neither (identity — its GL pipeline does not accumulate the flip here). Each is correct for its platform. Zeroing web's `uMaskUvScale`, or copying iOS's `(1,-1)` onto Android, breaks that platform's compositing. The per-platform table lives in `shaders/composite.frag`; the why is in PATTERNS.md "Texture-orientation convention."

5. **The composite is background-source-agnostic; that is the extensibility model.** `shaders/composite.frag` is `mix(background, original, mask)` and does not care what the background texture is. Effects differ ONLY in how that texture is produced: a PNG (background-image), the blurred camera (blur), or a procedural GLSL shader (planned, issue #25). A new shader dropped into `shaders/` (single source → codegen to all platforms) gets the canonical upright frame and composites through the mask with ZERO orientation work; only its raw compute cost varies by device, and that is handled by the resolution tier (`targetShortSide`), not orientation. The flip/rotate transform ops are debug/utility table-stakes, not the product surface; the product is the masked-background composite.

6. **Segmentation mask buffers are owned, never a shallow reused ring.** The mask the compositor reads must be a buffer the segmenter owns and hands out fresh per cycle (Android: a fresh bitmap; iOS: a `CVPixelBufferPool`), because frame-pipelining keeps a mask texture GPU-referenced across multiple cycles. A reused 2-deep ring gets overwritten mid-read and the mask visibly "drifts" / contorts. Preserve this if you touch the segmenter.

## Quick orientation

```
src/
├── index.ts                 # native entry; thin shim, Metro picks it via "react-native" condition
├── index.web.ts             # web entry; wires MediaStreamTrackProcessor pipeline per effect
├── types.ts                 # ApplyVideoEffects, EffectName
└── web/
    ├── effects/             # per-effect FrameTransform implementations
    │   ├── blur.ts
    │   ├── background-image.ts
    │   └── transform.ts       # flip-x/flip-y/rotate-cw/rotate-ccw (replaced mirror.ts)
    └── insertable-streams.ts  # MediaStreamTrackProcessor + MediaStreamTrackGenerator wiring

plugin/
├── src/withKaleidoscope.ts  # Expo config plugin (TypeScript source)
└── tsconfig.json            # plugin builds CJS-via-Node16 to plugin/build/

app.plugin.js                # ESM entry that re-exports plugin/build/withKaleidoscope.js
app.plugin.d.ts              # ConfigPlugin type for the entry above
expo-module.config.json      # Expo Modules autolinking config
```

## Conventions

- Bun, TypeScript ESM, biome for lint+format, semantic-release driven by Conventional Commits.
- Native module shape: `src/` is the JS facade, `android/` is Kotlin, `ios/` is Swift, `plugin/` is the Expo config plugin (TypeScript, compiled to `plugin/build/`).
- `react-native-webrtc` is a **peer dependency**, not a direct dependency. Do not import it from `src/` runtime code beyond type-only imports.
- Frame processors are registered once at app boot via the config plugin. Do not move registration into a runtime-callable path.
- Web target uses `MediaStreamTrackProcessor` + `MediaStreamTrackGenerator` (Insertable Streams). Metro's `.web.ts` resolution swaps `src/index.ts` ↔ `src/index.web.ts`.
- Package is `"type": "module"`; every `.js` file in the repo is parsed as ESM by Node. CJS syntax (`module.exports`, `require(...)`) is invalid at the top level.

## The undocumented API

The headline upstream surface, `track._setVideoEffects(['name'])` on `MediaStreamTrack` from `react-native-webrtc`, is **public-but-non-standard**, not private. Underscore-prefix here marks "non-standard extension." See PR #1176, PR #1331, PR #1681 in the upstream repo, and `node_modules/react-native-webrtc/src/MediaStreamTrack.ts:130` once installed.

Before changing the JS facade in `src/index.ts`, **verify the upstream contract on the currently installed version of `react-native-webrtc`**. The shape is non-standard and may shift between minor versions.

## Native conventions

- **Android (Kotlin):** factories implement `com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface`. Frame buffers come in as `VideoFrame` (I420). Preserve rotation and timestamp on the way out.
- **iOS (Swift):** processors conform to the WebRTC frame-processor protocol declared in `react-native-webrtc/ios/RCTWebRTC/videoEffects/VideoFrameProcessor.h`. CoreImage / Vision is the natural toolkit.
- Registration objects (`Registration.kt`, `Registration.swift`) are the only file the config plugin should touch. Effect factories are pure and stateless across instances.
- Don't introduce React/RN imports into native code beyond what Expo Modules already provides.

## Common commands

```sh
bun run check                # full local-pre-push gate (lint:fix, typecheck variants, build, demo build, test, knip, package hygiene)
bun run lint                 # biome check
bun run lint:fix             # biome check --write
bun run typecheck            # tsgo --noEmit on src/
bun run typecheck:test       # tsgo --noEmit on src + test + plugin/src against tsconfig.test.json
bun run typecheck:demo       # tsc --noEmit on demo/
bun run build                # emit dist/ (tsgo) and plugin/build/ (tsc -p plugin/)
bun test                     # bun's test runner; smoke test for the plugin
bun run check:package        # publint + attw with internal-resolution-error ignored
bun run check:knip           # knip; flags unused deps and dead code
bun run refresh:android      # bun install --force in demo/ with stripped env (see gotcha below); ~90s
bun run prebuild:android     # chains refresh:android then expo prebuild; run after fresh checkout, or when adding new native source directories, or when config plugin / app.config.ts changes
bun run check:android        # local Kotlin compile of the kaleidoscope module; ~3s incremental, ~40s cold
bun run demo                 # build lib first, then start demo (interactive picker)
bun run demo:web             # same, web only
bun run demo:wsl             # WSL2-only: Metro binds 0.0.0.0 and reports the Windows-host LAN IP (see gotcha below)
cd demo && bun run check:expo  # manual SDK-drift check; not in the aggregator (see gotcha below)
```

## Commits

Conventional Commits, imperative tense, succinct. `feat:` → minor release; `fix:` → patch; `feat!:` or `BREAKING CHANGE:` footer → major. See [CONTRIBUTING.md](./CONTRIBUTING.md). Scope examples: `fix(android)`, `feat(blur)`, `feat(web)`, `chore(plugin)`.

## Things that will trip you up

- **No `.js` extensions on relative imports in `src/`.** Tempting because strict node16 ESM resolution wants them, but Metro does not map `.js` to `.ts` for the `react-native` exports condition that ships TS source. Anything you add to `src/index.ts` or `src/index.web.ts` resolves the way the existing imports do (extension-less). `attw` is configured with `--ignore-rules internal-resolution-error` to absorb the resulting node16-from-ESM check.
- **`app.plugin.js` is ESM, not CJS.** The package is `"type": "module"`, so the file is parsed as ESM by Node. Use `import` / `export default`, never `module.exports` / `require`. The compiled `plugin/build/withKaleidoscope.js` is also ESM (built with `module: Node16` in `plugin/tsconfig.json`).
- **`plugin/tsconfig.json` uses `module: Node16` + `moduleResolution: node16`.** TS 6 deprecated `moduleResolution: node` (legacy node10). The plugin emits Node16-compatible output that happens to be CJS via the package's `"type": "module"` flip-side: when a `.cjs` file exists or the package type forces ESM, Node16 mode picks accordingly. Do not regress this to `CommonJS` + `node`.
- **`@expo/config-plugins` v9 ≠ SDK 51.** The legacy `@expo/config-plugins@9.x` line was updated post-hoc to track SDK 53 internals. The version `expo@51.0.39` actually ships internally is `~8.0.8`. Root devDep is pinned `~8.0.8` so doctor stays clean. Bumping to v9 (or v55) without bumping `expo` re-breaks the integration story; follow Lifeguides on the next SDK bump rather than getting ahead of it.
- **Local `check:expo` can false-positive.** Doctor's `SupportPackageVersionCheck` shells out to `npm explain`, which walks the parent directories looking in every `node_modules` it finds. When this repo sits next to another Expo SDK project on disk (e.g. `~/Simiancraft_Programming/Lifeguides/`), `npm explain` reports the sibling's `@expo/config-plugins@54.x` as part of "our" tree. CI never sees this. The aggregator does not include `check:expo` for exactly this reason; run it manually when verifying Expo dep alignment.
- **Release job is opt-in.** `vars.RELEASE_ENABLED` gates the semantic-release job in `ci.yml`. To activate: configure `APP_ID` + `APP_PRIVATE_KEY` repo secrets (GitHub App that can bypass main's ruleset for the `chore(release)` commit + tag), then `gh variable set RELEASE_ENABLED --body true`.
- **Demo Metro picks up `src/` directly via `link:..`.** The demo's `package.json` resolves the workspace as `link:..` and Metro reads the package's `react-native` exports condition pointing at `src/index.ts`. Changes to `src/` take effect without a publish, but the demo's `bun run start` does NOT run `bun run build` first by default; the `demo*` scripts at the repo root prefix `bun run build &&` so they do.
- **`bun run check:android` requires Java 17+ in `JAVA_HOME` and a prebuilt `demo/android/`.** WSL2's default OpenJDK is Java 8 (`/usr/lib/jvm/java-8-openjdk-amd64`); Gradle 8.8 can't run on it. Export `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64` (or wherever your distro's `update-alternatives` points Java 17). The script also assumes `demo/android/` exists — run `bun run prebuild:android` once after a fresh checkout, or any time `demo/app.config.ts` / the config plugin changes. Subsequent incremental compiles land in ~3 seconds. Not part of the `bun run check` aggregator since CI doesn't ship an Android SDK; opt-in for native iteration.
- **`refresh:android` is wrapped in `env -i HOME=$HOME PATH=$PATH bash -c` for a reason.** `bun run` injects `npm_package_json` (and other `npm_*` vars) into the script's environment. When the script then invokes a child `bun install --force` against the `file:..` workspace dep, those env vars make the child think it is the running package and the install fails on the local `react-native-webrtc-kaleidoscope` entry only (1267/1268 succeed, kaleidoscope errors). Stripping the env to just `HOME` and `PATH` bypasses the detection. The CWD-drift gotcha further down also bites here; the `cd demo` inside the script is what actually runs the install in the right directory.
- **WSL2 Metro can't be reached by a real device through the WSL adapter.** A phone on the LAN cannot reach the WSL2 NAT interface; Metro must bind 0.0.0.0 AND report the Windows-host LAN IP (not the WSL veth) in its bundle URL so the dev client knows where to fetch. `bun run demo:wsl` shells out to PowerShell from WSL to find the Windows host's real LAN adapter (skipping Hyper-V / vEthernet / loopback / etc.), exports it as `REACT_NATIVE_PACKAGER_HOSTNAME`, sets `METRO_LISTEN_ADDRESS=0.0.0.0` + `EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0`, then runs `expo start --dev-client --host lan --port 8081`. The plain `bun run demo` works on macOS / Linux native; use `:wsl` only on Windows-WSL2.

## Mobile dev builds (maintainer runbook)

Native iteration uses **EAS Build** to produce a `expo-dev-client` binary, **installed on a real device**, with the JS bundle streamed over Metro from the laptop. No simulators, no local Xcode or Android Studio toolchains.

The EAS project is owned by the `simiancraft` org:
`@simiancraft/react-native-webrtc-kaleidoscope-demo`, ID `9fe25758-9912-408f-b8a6-7f0b6c15a5a0` (set in `demo/app.config.ts:extra.eas.projectId`).

### First time on a new device

```sh
cd demo
# 1. Authenticate (uses your Expo personal account; org access via membership).
bunx eas-cli@latest login                       # interactive

# 2. Register a real iOS device (one-time per device, lets EAS sign ad-hoc IPAs).
bunx eas-cli@latest device:create               # follow the QR / link to register

# 3. Build the dev client. ~$2 iOS, ~$1 Android. Apple credentials prompt on first iOS.
bunx eas-cli@latest build -p ios --profile development
bunx eas-cli@latest build -p android --profile development
```

When each build finishes EAS prints an install link; open it on the registered device and install the dev-client APK / IPA.

### Day-to-day iteration

```sh
# From repo root: builds the lib first, then starts Metro in demo/.
bun run demo                # interactive picker (i / a / w)
bun run demo:ios            # launches Metro and the iOS dev-client (if connected)
bun run demo:android        # ditto for Android
bun run demo:web            # browser only; no native build needed
```

The dev-client on the device scans the QR code shown in the terminal, opens a tunnel or LAN connection to Metro, and pulls the JS bundle. Edits to `src/`, `src/web/`, or `demo/app/` hot-reload without rebuilding.

### When to rebuild the dev client

Rebuild **only** when the native footprint changes; JS-only edits never need a new binary.

- Bumping `react-native-webrtc` (peer dep).
- Adding or changing native modules in `android/` or `ios/` (effect factories, registration).
- Changing the Expo config plugin's injection (`plugin/src/withKaleidoscope.ts`).
- Bumping the Expo SDK in `demo/` or this lib.

### Build provisioning hygiene

- **Don't add `EXPO_TOKEN` to repo secrets.** Without it, no GitHub Actions workflow (yours or a fork's) can spend EAS minutes. Builds are manual from your laptop only.
- **TestFlight is internal-testers-only.** No public install links. Same posture on Android: `eas device:create` registers your specific device for ad-hoc install.
- **Don't share the EAS account credentials.** EAS holds the iOS cert and provisioning profile; that is the trust boundary.

### A future chassis project

When a second mobile-RN library lands and shares native deps with kaleidoscope, promote a copy of `demo/` into a separate `simiancraft-rn-chassis` (or per-stack `chassis-webrtc`) repo and dev-client into multiple libraries from one binary. Until then, the per-library `demo/` IS the chassis; YAGNI on building chassis infrastructure pre-emptively.

## Reference

Sibling projects [chromonym](https://github.com/simiancraft/chromonym) and [unitforge](https://github.com/simiancraft/unitforge) are the architectural specimens for OSS-hygiene boilerplate, CI, release tooling, and documentation patterns. Match their template; do not invent a new one.
