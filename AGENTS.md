# react-native-webrtc-kaleidoscope — Agent Instructions

A managed-Expo-friendly Expo Module that registers named video frame processors with `react-native-webrtc` and exposes a typed JS facade. v0.1 ships `mirror` and `blur`.

## Status

Pre-1.0. The bootstrap-and-ship plan in `bootstrap-and-ship-v0-1.md` (root, while it exists) is the source of truth for the v0.1 scope. Follow the Inspector Gadget Rule: that plan deletes itself when v0.1 ships.

## Quick orientation

```
src/
├── index.ts                 # native entry; thin shim, Metro picks it via "react-native" condition
├── index.web.ts             # web entry; wires MediaStreamTrackProcessor pipeline per effect
├── types.ts                 # ApplyVideoEffects, EffectName
└── web/
    ├── effects/             # per-effect FrameTransform implementations
    │   ├── blur.ts
    │   └── mirror.ts
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
bun run demo                 # build lib first, then start demo (interactive picker)
bun run demo:web             # same, web only
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

## Reference

Sibling projects [chromonym](https://github.com/simiancraft/chromonym) and [unitforge](https://github.com/simiancraft/unitforge) are the architectural specimens for OSS-hygiene boilerplate, CI, release tooling, and documentation patterns. Match their template; do not invent a new one.
