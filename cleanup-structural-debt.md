# Clean Up v3 Structural Debt

**Status:** Draft
**Scope:** cross-stack
**Date:** 2026-06-03
**Last reviewed:** 2026-06-03
**Context:** The v3 unification branch (PR #31) accreted structural debt as features were appended rather than factored; we un-wreck it before the 3.0 release.

## Goal

The v3 branch grew by accretion: features were appended to whatever file was open instead of factored into the right shape. The result: a 725-line untyped CommonJS config plugin doing real asset-pipeline work outside the type system, copy routines duplicated four ways, a dead all-shaders aggregate shipped as public API, a platform-normalization resolver buried in the UI, and non-canonical vocabulary ("plate", "background") spread through code and docs. This plan systematically un-wrecks that before 3.0. Done looks like: all logic lives under TypeScript and is unit-tested; `app.plugin.js` is a one-line `require` shim; no duplicated copy routines; no orphan exports; cross-cutting utilities live in shared homes, not feature folders; and the code and docs speak only the canonical nouns (composite, layer, image). The codecov "island" dissolves because the plugin tests rejoin the normal suite.

## Domain context

The debt sorts into distinct diseases, each needing its own treatment (they are comorbid, not one disease with symptoms):

- **D1 — Structural rot (language-independent).** Duplicated/over-declared functions; the four near-identical copy routines in the plugin are the type case. iOS's extra work (pbxproj registration) should *call* a shared copy primitive, not reimplement it.
- **D2 — Ectopic logic.** Real logic living in the wrong language/place: `app.plugin.js` is CommonJS outside typecheck/lint/knip/coverage. It must move to TypeScript and be unit-tested. (Moving to TS does NOT cure D1; the duplication rides along unless excised deliberately.)
- **D3 — Orphans and wrong-shape placement.** Dead exports and files/utilities whose location disagrees with the project's shape: the consumer's `kaleidoscope.presets.ts` is the *only* intended barrel; internal aggregations and misfiled utilities are suspect.
- **D4 — Vocabulary drift.** Non-canonical nouns ("plate", "background") spread through code and docs, including the glossary files themselves. Canonical nouns: **composite, layer, image** (same discipline that killed "scene").

**Canonical vocabulary** (the code speaks ONLY these): `composite` (the one registered effect, a stack of layers), `layer` (one entry in the stack), `image` (a bundled WebP a `layer` resolves by id). "plate" and "background" are dead synonyms to normalize to "image".

## Workstreams

Status: ✅ complete · 🔶 in progress · ❌ not started · 🚫 descoped. Items graduate from **Open questions** into a numbered **Commit** below once their shape is settled.

### D2 — Move the config plugin into TypeScript
- ❌ Move plugin logic to `src/plugin/*.ts`, compiled to `dist/plugin/` (CJS), with `app.plugin.js` reduced to `module.exports = require('./dist/plugin')`. Pattern is Expo's own (`expo-asset`/`expo-font`/`expo-file-system` ship one-line shims over `plugin/build/`).
- Preserve: lazy `require(require.resolve('@expo/config-plugins', { paths: [projectRoot] }))` to use the *consumer's* SDK-matched version; `import type` for the types. CJS entry stays for old EAS Node loaders.
- ❌ Unit-test the extracted pure functions directly (no tmp-project/mod-driving gymnastics). Make `resolveComposite*` take the library root as an argument so it is testable under bun.

### D1 — Collapse the duplicated copy routines
- ❌ One `copyRefs(refs, destDir)` primitive. Android = `copyRefs` over each ref-collector. iOS = `copyRefs` + a small `registerInPbxproj(ids, ...)` step (the only genuine platform difference; Xcode requires resource registration, Android auto-merges `assets/`).
- ❌ Split the plugin's two responsibilities: iOS build patches (pods + deployment target) vs the asset precompiler. Separate modules.

### D3 — Orphans and placement
- ✅ Delete the dead `LAYER_CONTROLS` aggregate export (commit `3e6f22b`). Kept the per-shader `*_CONTROLS` and the `ShaderUniformsMap` type.
- ❌ Relocate the `resolve-background-uri` trio out of `ui/picker/` to a shared util/lib home; rename off the dead `background` noun. It is a platform-normalization helper (the `cn` of image resolution): web passes through, native uses `expo-modules-core`. Any component can call it. Update `preset-grid` import AND the `package.json` `browser`-field remap (it selects the `.web` variant for non-Metro bundlers).
- ❌ Rename `preset-grid.tsx` → `grid.tsx`, `preset-tile.tsx` → `tile.tsx`.
- ❌ Extract `clamp` (currently local in `src/web/tuning.ts`) to a shared util.
- ❌ `src/ui/picker/layout.tsx`: inline state-switching (lines ~37–44) violates the Zone Composer convention; review with the zone-composer skill (likely the switch collapses out).

### D4 — Normalize vocabulary
- ❌ De-plate: replace "plate" → "image" across code comments and docs (236 hits, incl. `AGENTS.md`/`CLAUDE.md`/`PATTERNS.md`/`llms.txt`). Same for stray "background".

## Answered questions (decision log)

- **Is `app.plugin.js` source or built?** Source. Tracked, no generator, shipped as-is. So "ignore it because it's generated" is invalid.
- **Why must `app.plugin.js` be JS?** Only the *entry* must be CJS (old EAS Node loaders). All logic can and should be TS; Expo's own modules prove the shim-over-build pattern.
- **Must the plugin avoid `@expo/config-plugins`?** No; it must avoid *baking in the library's version*. Lazy-resolve from the consumer; that survives in TS.
- **Should the `resolve-background-uri` platform split be removed?** No. The split is correct (web URL vs native runtime bundle lookup); the defect is its *location* (UI folder) and its *name* (`background`).
- **Is "plate" a real distinction or drift?** Drift; normalize to "image".
- **Is `LAYER_CONTROLS` used?** No. Orphan. Removed.

## Open questions

1. **`app.plugin.js` module decomposition** — exact module split under `src/plugin/` (e.g. `ios-pods.ts`, `book.ts`/parse, `copy.ts`). Settle before drafting D1/D2 commits.
2. **`resolve-background-uri` destination + new name** — which shared home (`src/lib/`? `src/utils/`?) and what name (`resolveImageUri`? `resolveImageSource`?).
3. **`shaders.generated.ts`** (1203 lines, codegen) — keep committed, or gitignore and build? Open.
4. **React Native Compiler** — adopt it to drop hand-written `useMemo` across the picker/controls? Jesse wants this if feasible; verify compatibility.
5. **Coverage policy** — likely moot once the plugin is TS-tested; confirm the codecov gate passes on the new shape rather than deciding an ignore.

## Verification philosophy

Each deletion/move is verified by the full static gate (lint, typecheck, typecheck:test, test, knip, build) and, where it touches native or runtime wiring, `prebuild` + a run (web at minimum). "Delete a file → prebuild + run still works" is the loop. Nothing claimed working without running the relevant gate.

## Commits

Detailed per-item as each Open question is settled. Shipped so far:

### Commit 1: Drop the unused LAYER_CONTROLS aggregate — ✅ `3e6f22b`

### Commit N+1: Delete this plan
- Delete `cleanup-structural-debt.md` once every workstream is ✅ and the verification checklist passes.
- Extract any durable convention (e.g. the plugin-shim pattern, the de-plate vocabulary rule) into `PATTERNS.md`/`AGENTS.md` first.

## Verification checklist
- [ ] D1: no duplicated copy routines; iOS calls the shared copy primitive.
- [ ] D2: `app.plugin.js` is a one-line shim; plugin logic is TS and unit-tested.
- [ ] D3: no orphan exports; cross-cutting utilities relocated; picker files renamed.
- [ ] D4: "plate"/"background" purged from code and docs; glossary speaks composite/layer/image.
- [ ] Full validation (`bun run check`) green; codecov gate green on the new shape.
- [ ] Plan file deleted (Inspector Gadget Rule: no orphan plans).

## References
- PR #31 (`feat/kaleidoscope-command-registry`), the v3 unification this cleans up after.
- `CLAUDE.md` / `AGENTS.md` — canonical vocabulary + plugin constraints.
- Expo shim pattern: `node_modules/expo-asset/app.plugin.js` and siblings.
