# Add Deterministic UI Test IDs and Fill A11y Gaps

**Status:** In progress
**Scope:** cross-stack
**Date:** 2026-06-03
**Last reviewed:** 2026-06-03
**Context:** Maestro flows match controls by visible text, which is locale/theme/copy-brittle and broke on the transform sweep; the kit needs stable, generated test ids (and the a11y that backs them) across the control and picker surfaces.

## Goal

Maestro currently selects kit UI by visible text, so a copy or theme change silently breaks a flow, and dynamically generated shader forms have no addressable handle at all. Introduce one pure test-id grammar and thread it to every interactive leaf so each control, field, tab, category, and tile carries a deterministic, semantic `accessibilityIdentifier` derived from data it already owns (preset id, layer id, uniform name, taxonomy). Fill the real a11y gaps the same pass (the transform buttons have role but no label). Done looks like: every control and picker leaf renders a `kld.*` testID generated centrally; a new shader dropped into `shaders/<name>/` inherits field ids for free with zero per-composite edits; the pure grammar is unit-tested; and a Maestro flow can switch from `tapOn: "90°"` to `tapOn: { id: "kld.transform.rotate-90" }`.

## Domain context

- **Three id sources, three levels.** The **preset id** lives in `KaleidoscopeTuner` (`value`, a kebab book key); the **layer id** in each `ControlForm` (`id="sky"`); the **uniform name** in the field (`Slider`/`ColorPicker` `uniform`). Only the bottom one currently reaches the leaf.
- **The generated path.** Flow the preset id from the Tuner down a small `ControlScopeContext`; `ControlForm` composes `preset.layer`; `useField` appends the uniform. The per-composite `.controls.tsx` files never change.
- **Two families bypass `ControlForm`.** `KaleidoscopeTransformControls` and `KaleidoscopeMaskControls` are rendered directly by the consumer with no preset context, so they take a static `testIDPrefix` (default `kld.transform` / `kld.mask`).
- **Picker taxonomy.** Tabs are `taxonomy[0]` (family), the left menu is `taxonomy[1]` (category, scoped to the active family), tiles are book keys. Family/category are display strings; slug them.
- **No render harness.** Tests are pure-logic only; the verifiable core is the grammar module, unit-tested.

## The grammar (the convention, decided)

Root token `kld`. Dot-delimited. Slug rule: lowercase, spaces/underscores → `-`, strip non `[a-z0-9-]`, collapse repeats, trim.

| Surface | Id | Example |
|---|---|---|
| Control field (through `ControlForm`) | `kld.<preset>.<layer>.<uniform>` | `kld.fairy-grotto.sky.uSkyLow` |
| Color channel | `<field>.r` / `.g` / `.b` | `kld.fairy-grotto.fireflies.uColor.g` |
| Section copy button | `<scope>.copy` | `kld.fairy-grotto.sky.copy` |
| Standalone form (no Tuner) | `kld.<layer>.<uniform>` | `kld.sky.uSkyLow` |
| Transform | `<prefix>.rotate-<deg>` / `<prefix>.flip-<axis>` | `kld.transform.rotate-90` |
| Mask | `<prefix>.<row>` | `kld.mask.hardness` |
| Family tab | `kld.family.<slug>` | `kld.family.worlds` |
| Category item | `kld.category.<slug-family>.<slug-cat>` | `kld.category.worlds.wizard-tower` |
| Preset tile | `kld.preset.<id>` | `kld.preset.fairy-grotto` |

## Current surface area

| File | Role | Change |
|---|---|---|
| `src/test-id.ts` | — | NEW: pure grammar |
| `src/controls/form/scope.ts` | — | NEW: `ControlScopeContext` |
| `src/controls/tuner.tsx` | renders active controls | provide preset scope |
| `src/controls/form/control-form.tsx` | per-layer provider | compute + expose `path` |
| `src/controls/form/use-field.ts` | field hook | return `testID` |
| `src/controls/primitives/slider.tsx` | scalar field | apply testID |
| `src/controls/primitives/color-picker.tsx` | rgb field | group + channel testIDs |
| `src/controls/primitives/button.tsx` | copy button | accept testID |
| `src/controls/control-section.tsx` | chrome + copy | copy testID from path |
| `src/controls/transform-controls.tsx` | flip/rotate | testIDPrefix + ids + a11y labels |
| `src/controls/mask-controls.tsx` | mask sliders | testIDPrefix + ids |
| `src/ui/picker/index.tsx` | tabs + categories | family/category testIDs |
| `src/ui/picker/presets/preset-grid.tsx` | tile grid | compute + pass tile testID |
| `src/ui/picker/presets/preset-tile.tsx` | tile leaf | accept testID |
| `src/ui/picker/picker.types.ts` | RenderTile contract | add `testID` to state |
| `demo/app/index.tsx` | consumer | apply tile testID in `renderDemoTile` |
| `test/test-id.test.ts` | — | NEW: grammar unit tests |
| `PATTERNS.md` | conventions | document the grammar |

## File structure: before

**Legend:** ✏️ rewritten

```
src/
├── ✏️ controls/
│   ├── ✏️ control-section.tsx
│   ├── ✏️ tuner.tsx
│   ├── ✏️ transform-controls.tsx
│   ├── ✏️ mask-controls.tsx
│   ├── form/
│   │   ├── ✏️ control-form.tsx
│   │   └── ✏️ use-field.ts
│   └── primitives/
│       ├── ✏️ slider.tsx
│       ├── ✏️ color-picker.tsx
│       └── ✏️ button.tsx
└── ui/picker/
    ├── ✏️ index.tsx
    ├── ✏️ picker.types.ts
    └── presets/
        ├── ✏️ preset-grid.tsx
        └── ✏️ preset-tile.tsx
test/
demo/app/
└── ✏️ index.tsx
```

## File structure: after

**Legend:** 🆕 new · ✏️ rewritten

```
src/
├── 🆕 test-id.ts                         // pure grammar: slug + id builders
├── controls/
│   ├── ✏️ control-section.tsx            // copy button testID from form path
│   ├── ✏️ tuner.tsx                      // wrap controls in ControlScopeContext
│   ├── ✏️ transform-controls.tsx         // testIDPrefix + ids + a11y labels
│   ├── ✏️ mask-controls.tsx              // testIDPrefix + ids
│   ├── form/
│   │   ├── 🆕 scope.ts                   // ControlScopeContext (presetId|null)
│   │   ├── ✏️ control-form.tsx           // expose composed path in context
│   │   └── ✏️ use-field.ts               // return generated testID
│   └── primitives/
│       ├── ✏️ slider.tsx                 // apply field testID
│       ├── ✏️ color-picker.tsx           // group + .r/.g/.b channel testIDs
│       └── ✏️ button.tsx                 // accept + apply testID
└── ui/picker/
    ├── ✏️ index.tsx                      // family + category testIDs
    ├── ✏️ picker.types.ts                // RenderTile state gains testID
    └── presets/
        ├── ✏️ preset-grid.tsx            // compute kld.preset.<id>, pass down
        └── ✏️ preset-tile.tsx            // accept + apply testID
test/
└── 🆕 test-id.test.ts                    // grammar unit tests
demo/app/
└── ✏️ index.tsx                          // renderDemoTile applies state.testID
```

## Commits

### Commit 1: Add the pure test-id grammar and its unit test

**Files created:**
- `src/test-id.ts`: `TESTID_ROOT`, `slug`, `controlScope`, `fieldTestId`, `rotateTestId`, `flipTestId`, `familyTestId`, `categoryTestId`, `presetTileTestId`. Pure, no React/RN imports.
- `test/test-id.test.ts`: cover slug edge cases (spaces, caps, punctuation, collapse), control scope with/without preset, family-qualified category, transform/mask builders.

**Gate:** `bun run typecheck && bun run lint && bun test` green. `bun run check:knip` clean (test counts as consumer).

### Commit 2: Thread preset/layer scope to the field hook

**Files created:**
- `src/controls/form/scope.ts`: `ControlScopeContext = createContext<string | null>(null)`.

**Files rewritten:**
- `src/controls/tuner.tsx`: wrap `<Controls>` in `<ControlScopeContext.Provider value={value}>`.
- `src/controls/form/control-form.tsx`: read scope presetId, compute `path = controlScope(presetId, id)`, add `path` to `ControlFormContextValue`.
- `src/controls/form/use-field.ts`: add `testID: fieldTestId(ctx.path, key)` to the returned `Field`.

**Gate:** `bun run typecheck && bun run lint && bun test` green. No leaf consumes `testID` yet; tree still builds.

### Commit 3: Apply field test ids in the control primitives

**Files rewritten:**
- `src/controls/primitives/slider.tsx`: `testID={field.testID}` on `RNSlider`.
- `src/controls/primitives/color-picker.tsx`: group `testID` on container, `${field.testID}.r|g|b` per channel slider.
- `src/controls/primitives/button.tsx`: accept optional `testID`, apply it.
- `src/controls/control-section.tsx`: copy `Button` gets `${path}.copy` read from `ControlFormContext`.

**Gate:** `bun run typecheck && bun run lint && bun test` green.

### Commit 4a: Transform controls — prefix, ids, and a11y labels

**Files rewritten:**
- `src/controls/transform-controls.tsx`: add `testIDPrefix = 'kld.transform'` prop; `testID` on each flip/rotate `Pressable` via `flipTestId`/`rotateTestId`; add `accessibilityLabel` ("Flip horizontal"/"Flip vertical", `Rotate <deg> degrees` / "No rotation").

**Gate:** `bun run typecheck && bun run lint && bun test` green.

### Commit 4b: Mask controls — prefix and ids (same shape)

Follows 4a's template: add `testIDPrefix = 'kld.mask'` prop to `src/controls/mask-controls.tsx`; `testID={`${testIDPrefix}.${row}`}` on each `RNSlider` (a11y labels already present). Separate commit, own Gate.

### Commit 5: Picker family-tab and category-menu test ids

**Files rewritten:**
- `src/ui/picker/index.tsx`: `Tab` accepts + applies `testID={familyTestId(family)}`; `CategoryItem` accepts + applies `testID={categoryTestId(activeTab, category)}`.

**Gate:** `bun run typecheck && bun run lint && bun test` green.

### Commit 6: Picker tile test ids through the render-prop

**Files rewritten:**
- `src/ui/picker/picker.types.ts`: add `testID: string` to the `RenderTile` state object; document.
- `src/ui/picker/presets/preset-grid.tsx`: compute `presetTileTestId(preset.id)`, pass into render state and the default tile.
- `src/ui/picker/presets/preset-tile.tsx`: accept optional `testID`, apply to the `Pressable`.
- `demo/app/index.tsx`: `renderDemoTile` applies `state.testID` to its tile root.

**Gate:** `bun run typecheck && bun run lint && bun run typecheck:demo && bun test` green.

### Commit 7: Document the test-id and a11y convention

**Files rewritten:**
- `PATTERNS.md`: add a "Test ids and accessibility" section with the grammar table and the rule that field ids are generated, not hand-authored.

**Gate:** `bun run check` (full) green.

### Commit 8: Delete this plan

- Delete `add-deterministic-ui-testids.md` (convention already extracted to `PATTERNS.md` in Commit 7).

**Gate:** `bun run check` green. Repo contains no references to the plan file.

## Verification checklist

- [ ] `src/test-id.ts` is pure (no React/RN import) and every export is consumed by `src/`.
- [ ] Every control field, transform button, mask row, family tab, category item, and preset tile renders a `kld.*` testID.
- [ ] A composite `.controls.tsx` file was NOT edited (the generated path requires no per-composite change).
- [ ] `bun run check` passes.
- [ ] `PATTERNS.md` documents the grammar.
- [ ] Plan file deleted (Inspector Gadget Rule).

## References

- `PATTERNS.md` — consumable controls convention (the section this extends).
- Maestro flows in `/tmp/maestro-*.yaml` — switch text selectors to `id:` after this lands (out of repo; not a commit).
