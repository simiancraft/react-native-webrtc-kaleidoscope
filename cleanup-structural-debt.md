# Reorganize the Library Around Its Points of Entry

**Status:** Draft
**Scope:** cross-stack
**Date:** 2026-06-03
**Last reviewed:** 2026-06-03
**Context:** The v3 surface works, but its file-and-idea organization has no overriding spine, so it conceals defects; we rebuild it around its points of entry and a driver/contract split before 3.0.

## Goal

The v3 surface works, but its organization has no overriding spine, so it conceals defects: ectopic plugin logic, duplicated copy routines, orphan exports, vocabulary drift, force-bundled shaders, and disorderly components. Rebuild the library around its four natural **points of entry** — the **preset book** a consumer declares, the **runtime** that commands it, the **prebuild** that places its assets, and the convenience **components** — plus a ports-and-adapters **driver split** where `android/`, `ios/`, and `web-driver/` each implement one contract (the effect **spec**) behind their platform. Rename from the preset book down with a `Kaleidoscope`-prefixed vocabulary so the "spec" indirection collapses. Done: every file's location states what it is and when it runs; `catalog/` sits out of the build path; drivers are parallel peers behind the spec; tests segment per entry point; code and docs speak one vocabulary.

## Domain context

**Four points of entry** (they are entry points because they fire at different times):
1. **`kaleidoscope.preset-book.ts`** — what the developer *declares* to extend the library. The consumer's barrel; the tree prebuild walks. (Authoring time.)
2. **`kaleidoscope/`** — the *runtime*: exactly three functions (`kaleidoscope` / `transform` / `mask`) plus `applyVideoEffects` / `bindKaleidoscope`. (Per-frame.)
3. **`prebuild/`** — places assets and performs the natural tree-shake. (At `expo prebuild`.)
4. **`components/`** — convenience UI built on the preset book; what the demo imports. (Authoring time, optional.)

**Drivers and the contract (ports & adapters).** `android/` (Kotlin), `ios/` (Swift), and `web-driver/` (JS/WebGL) each render effects behind their platform. They conform to one **contract**: the effect **spec** (`CompositeSpec` — the ordered layer stack — plus the effect names). The service layer produces specs; each driver consumes them — native over the bridge (`serializeCompositeLayers` → `setCompositeLayers`), web in-process (`applyVideoEffects(track, [spec])`). The contract is conceptual (it can't be one typed interface across three languages); it's realized at each boundary and partly enforced by `registry-parity`. So the "spec" types are not indirection — they are the driver interface, and they live beside the runtime, not in the preset-book vocabulary.

**Entry isolation invariant.** `kaleidoscope` (runtime) and `prebuild` are separate built subtrees with separate package entries — `dist/kaleidoscope` is the main `.`; `dist/prebuild` is reached only by `app.plugin.js`. They must **never import each other** (no combined index): the runtime would otherwise bundle Node/`fs`/`@expo/config-plugins`, and the prebuild would bundle React Native + the WebGL driver. Whatever they genuinely share goes in `src/lib`, which is therefore **environment-neutral** (no `node:*`, no React Native). Prebuild-only shared code (parser, `copyRefs`) stays in `prebuild/lib`.

**Catalog.** `shaders/`, `images/`, `composites/` (future `materials/`, `sounds/`, `particles/`) are opt-in, almost entirely declarative assets. They move under `catalog/`, fully out of the build path. The preset book references into it; the types that *describe* an asset live beside it (shader-uniform types in `catalog/shaders/`).

**The comorbid diseases this reorg cures** (named earlier; each needs its own treatment):
- **D1** duplicated copy routines (collapse to one `copyRefs`; iOS adds only pbxproj registration).
- **D2** ectopic plugin logic (CommonJS island → `prebuild/` TypeScript; `app.plugin.js` a one-line shim).
- **D3** orphans / wrong-shape placement (dead exports, misfiled utilities).
- **D4** vocabulary drift ("plate"/"background"/"scene" → composite/layer/image; spec-noise gone).
- **D5** web force-bundle (per-shader subpaths so consumers pay only for shaders their presets use).
- **D6** disorderly components (`controls/` + `ui/` are both UI with no `components/` spine; `ui/` is inverted; "controls" overloaded).
- **C1** correctness, separate: the catalog types ten generative shaders but the codegen registers one natively (`GENERATIVE_SHADERS = ['plasma.frag']`).

**Vocabulary spine** (from the preset book down, `Kaleidoscope`-prefixed): `KaleidoscopePresetBook` → `KaleidoscopePreset` → { `KaleidoscopeTaxonomy`, `KaleidoscopeLayer`, `KaleidoscopeLayerTarget`, `KaleidoscopeBlendMode`, `KaleidoscopeControls<T>` }. `RGB` stays general. Canonical asset nouns: composite / layer / image.

## File structure: before

```
react-native-webrtc-kaleidoscope/
├── android/ · ios/             # native drivers (Kotlin / Swift)
├── shaders/ · images/ · composites/   # asset source folders (out of src/)
├── app.plugin.js               # 725-line CommonJS config plugin (logic island)
├── test/                       # ALL JS tests, interleaved
├── ios-tests/                  # some iOS tests
└── src/
    ├── index.ts · index.web.ts # platform-split runtime entry
    ├── types.ts                # root "spec" types (+ a second type file below)
    ├── livekit.ts · nativewind.ts · test-id.ts
    ├── shaders/index.ts        # type-catalog barrel reaching ../../shaders
    ├── kaleidoscope/           # controls.ts (command machine) · shader-to-spec.ts · types.ts
    ├── controls/               # tuning UI kit + primitives/ + tuner.tsx + theme/
    ├── ui/picker/              # picker feature (+ resolve-background-uri trio)
    └── web/                    # the WEB rendering engine (effects/ · segmenter · streams · tuning · shaders.generated)
```

## File structure: after

**Legend:** `+` new · `🔀` moved/renamed (`new ← old`) · `🪓` split-source · `␡` deleted

```
react-native-webrtc-kaleidoscope/
├── android/          # Kotlin driver        + android/.../test/ (driver-local suite)
├── ios/              # Swift driver         + ios-tests/ (driver-local suite, already segmented)
├── web-driver/       # 🔀 ← src/web/  JS/WebGL driver: own index entry + own test/
├── catalog/          # 🔀 out of build path; almost entirely declarative
│   ├── shaders/<name>/   # 🔀 ← shaders/<name>/  <name>.frag + the shader's uniform/options types
│   ├── images/<category>/    # 🔀 ← images/
│   └── composites/<name>/    # 🔀 ← composites/
├── app.plugin.js     # 🪓 one line: module.exports = require('./dist/prebuild')
└── src/
    ├── kaleidoscope.preset-book.types.ts   # + ENTRY #1 vocabulary (shared root, product-prefixed)
    ├── kaleidoscope/        # ENTRY #2 runtime: index.ts (+ .web.ts) = the 3 functions;
    │                        #   command machine; spec/contract types; test/
    ├── prebuild/            # 🪓 ← app.plugin.js  ENTRY #4: index.ts (withKaleidoscope) + test/
    │   ├── ios/             #   ios.dangerous: pods + deployment-target (isVersionLessThan) + pbxproj registration
    │   ├── android/         #   android.dangerous: Android asset placement
    │   └── lib/             #   prebuild-internal shared: the book parser + the one copyRefs primitive
    ├── lib/                 # shared-by-everything: id-maker (🔀 ← test-id.ts), clamp, generic types; test/
    ├── components/          # ENTRY #3: ui/ primitives (🔀 ← controls/primitives) + picker/ + tuner/ ; test/
    ├── livekit.ts           # root-level adapter (specialty tech) — stays in src/
    └── nativewind.ts        # root-level adapter (specialty tech) — stays in src/
```
Notes: `src/types.ts` and `src/shaders/index.ts` are `␡` (their contents redistribute to `kaleidoscope.preset-book.types.ts`, `catalog/shaders/`, and `kaleidoscope/`). The `controls/` + `ui/` split collapses into `components/`.

## Build methodology (build right, then delete wrong)

Migrate **from the preset book down**, one piece at a time, each a green step:
1. **Name it and state what it does** (the Phase-1 ontology check, in writing).
2. **Author it correctly** in its new home with its correct name.
3. **Find the old thing it was, and delete it.**
4. **Gate:** `bun run check` (and the relevant driver compile) stays green.

Start with `KaleidoscopePresetBook` and walk the vocabulary down, deleting the "spec" types that don't survive the rename as we go. Never leave the old and new coexisting past a single step.

## Test structure (segmented per entry point / driver / module)

No central `test/`. Tests colocate with the thing they test, so the four+ areas don't interleave:
- `android/` and `ios/` (and `ios-tests/`) — each driver's own native suite.
- `web-driver/test/` — the web driver's suite.
- `src/kaleidoscope/test/`, `src/prebuild/test/`, `src/components/test/`, `src/lib/test/` (or colocated `*.test.ts` per module).
- `registry-parity` (the cross-driver contract test) is the one that spans drivers; it lives with the contract (beside `kaleidoscope/` runtime), not inside any single driver.

## Workstreams (detailed per item during the file-by-file pass)

- **W1 — Preset-book vocabulary.** Author `src/kaleidoscope.preset-book.types.ts` from the book down; rename `kaleidoscope.presets.ts → kaleidoscope.preset-book.ts` everywhere (the plugin's `PRESET_BOOK_FILENAME`, demo, tests, README/llms.txt); delete `src/types.ts`; collapse the spec types.
- **W2 — Drivers.** Move `src/web/ → web-driver/` at the repo root (peer to `android/`/`ios/`); give it its own entry + test suite; extract shared source that was hiding in it (`clamp`, tuning ranges) to `src/lib/`.
- **W3 — Prebuild.** Move `app.plugin.js` logic into `src/prebuild/` TypeScript (D2), split `ios/` · `android/` · `lib/`; `app.plugin.js` → one-line shim. No `web`. The text parser is prebuild-only (runtime gets the book as an object). Function map (every `app.plugin.js` member → TS home; all testable):
  - `prebuild/index.ts` — `withKaleidoscope` (thin; wires the two mods).
  - `prebuild/ios/index.ts` — the `ios.dangerous` mod (orchestration). `prebuild/ios/pods.ts` — `resolveWebrtcPod` + `patchPodfile` + `SENTINEL`. `prebuild/ios/deployment-target.ts` — `IOS_DEPLOYMENT_TARGET` + `isVersionLessThan` (private) + the props bump. `prebuild/ios/copy.ts` — `copyIosAssets` (folds `copyIosImages`+`copyIosThumbnails`; `copyRefs` + pbxproj registration).
  - `prebuild/android/index.ts` — the `android.dangerous` mod. `prebuild/android/copy.ts` — `copyAndroidAssets` (folds the two Android copiers over `copyRefs`).
  - `prebuild/lib/book.ts` — `parseImports`, `imageIdFromSpecifier` (← `plateIdFromSpecifier`, de-plate), `parseImageRefs`, `resolveCompositeSource`, `resolveAssetPath`, `PRESET_BOOK_FILENAME`, and the two collectors folded over a shared `walkBookSources` (they collect different families — image-layer plates vs composite thumbnails — so two thin extractors, one walk). `prebuild/lib/copy.ts` — the new `copyRefs(refs, destDir)` primitive.
  - `src/lib/constants.ts` — `LOG_TAG` (the `[react-native-webrtc-kaleidoscope]` prefix, extracted; messages stay inline at the point of emission — no error map).
  - Leftover glue (not named functions): the `config.mods` init + the previous-mod **chaining** (cooperate-don't-clobber) → `prebuild/index.ts`. The header doc block redistributes (why-CJS-shim → the shim; modular-headers → `prebuild/ios/pods.ts`).
  - Packaging tail: delete `app.plugin.d.ts` (types now come from `dist/prebuild`); repoint `exports["./app.plugin.js"].types` → `./dist/prebuild`; drop the `.d.ts` from `files`.
  - Behavior change: the shim `require('./dist/prebuild')` means `dist` must be built before prebuild runs (published consumers ship `dist`; the library's own demo already builds first). Today's plugin works with no build; document the new dependency.
- **W4 — Components.** Collapse `controls/` + `ui/` into `components/` (`ui/` primitives + `picker/`/`tuner/` features) per Zone Composer (D6); relocate `resolve-background-uri` (rename off `background`).
- **W5 — Catalog.** Move `shaders/`, `images/`, `composites/` under `catalog/`; move the shader type-catalog beside the shaders; per-shader subpath exports (D5).
- **W6 — Lib.** `test-id.ts → src/lib/` (it's an id-maker, not test-ids; consider renaming the concept); `clamp` and generic types (`RGB`) land here.
- **W7 — Vocabulary + docs.** De-plate / de-background / de-scene across code and docs (D4); update `CLAUDE.md`/`AGENTS.md` glossary for the `preset` vs `composite` split.

## Answered questions (decision log)

- `app.plugin.js` is hand-authored source, not generated → its logic must be TS and tested; `app.plugin.js` becomes a one-line shim over `dist/prebuild`.
- Only the plugin *entry* must be CJS (old EAS Node loaders); all logic can be TS (Expo's own modules ship one-line shims over built TS).
- `LAYER_CONTROLS` was a dead orphan export → removed (commit `3e6f22b`).
- The `resolve-background-uri` platform split is correct (web URL vs native runtime lookup); the defect is its UI-folder location and its `background` name.
- `web/` does the same job as `android/`/`ios/` → it's a platform **driver**, moves to `web-driver/` at the root.
- Don't wrap the three drivers in a `drivers/` folder: relocating `android/`/`ios/` fights default autolinking (Expo + RN CLI + CocoaPods, no override configured) for zero functional gain. Root-level peers + the `web-driver` name + a `PATTERNS.md` note capture the relationship instead.
- The "spec" types are the **driver contract**, not indirection; they live beside the runtime, simplify when named from the preset book down.
- `nativewind.ts` / `livekit.ts` stay in `src/` (root-level specialty-tech adapters).
- `test-id.ts → src/lib/` (id-maker, not test-ids).
- Tests segment per entry point / driver / module; no central `test/`.

## Open questions (to settle at the end of the file-by-file tour)

1. **`KaleidoscopeControls` collision** — the runtime three-verb handle vs the preset's tuning-component generic both want the name. Rename the handle (`KaleidoscopeBinding` / `KaleidoscopeSession` / `KaleidoscopeHandle`), freeing `KaleidoscopeControls<T>` for the preset's `controls`.
2. **`preset` vs `composite` glossary split** — the consumer writes a `preset`; it projects into a runtime `composite`. Touches `CLAUDE.md`/`AGENTS.md` ("every preset is a composite").
3. **How far the spec types collapse** once renamed from the preset book down.
4. **`shaders.generated` placement** — `catalog/shaders/` (generated output beside source) vs `web-driver/` (web's compiled form).
5. **`createControls` factory** — keep the shared-state factory or flatten to functions (it's a factory because the three verbs share mutable binding state).
6. **C1 native generative-shader coverage** — register the rest natively or qualify the types.

## Verification checklist

- [ ] Every file's location states what it is and when it runs (entry-point spine holds).
- [ ] `catalog/` is out of the build path; drivers are root-level peers behind the spec.
- [ ] No `src/types.ts`; vocabulary named preset-book-down; spec indirection collapsed.
- [ ] `app.plugin.js` is a one-line shim; `prebuild/` is TS with no duplicated copy routines.
- [ ] `components/` holds `ui/` primitives + features; no `controls/`+`ui/` split.
- [ ] "plate"/"background"/"scene" purged from code and docs.
- [ ] Tests segmented per entry point / driver / module.
- [ ] `bun run check` green; codecov gate green on the new shape; native compiles.
- [ ] Plan file deleted (Inspector Gadget Rule: no orphan plans).

## Shipped

- ✅ `3e6f22b` — drop the unused `LAYER_CONTROLS` aggregate.

## References

- PR #31 (`feat/kaleidoscope-command-registry`), the v3 unification this reorganizes.
- `CLAUDE.md` / `AGENTS.md` — canonical vocabulary + plugin constraints (to be updated by W7).
- Zone Composer skill — the `components/` organization recipe (W4).
- Expo shim pattern: `node_modules/expo-asset/app.plugin.js` and siblings (W3).
