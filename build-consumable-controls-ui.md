# Build the consumable, themeable kaleidoscope controls UI

**Status:** Draft
**Scope:** cross-stack
**Date:** 2026-06-02
**Last reviewed:** 2026-06-02
**Context:** The per-uniform tuning controls live only in `demo/`, are not consumable by client apps, have no standard shape or theming, and must be hand-rebuilt for every shader; this blocks the "add a shader, get its editor for free" goal and must land before the Android live-uniform channel.

## Goal

Today a consumer gets the selector half (`KaleidoscopePicker` in `./ui`) but must hand-build the editor half, which only exists in `demo/src/`. This plan promotes the editor into a new `./controls` subpath as a **composition kit**: a per-form `ControlForm<U>` micro-provider holds a layer's view model (a `useReducer`, no form library) and emits id-keyed patches; a `makeControls<U>()` factory yields field components (`Slider`, `ColorPicker`, …) whose `uniform` prop is type-checked against the shader's uniform type and that self-wire to the form. Those compose into per-shader and per-composite turnkey form components that ride on each book entry as a `controls` component reference. A thin, controlled `KaleidoscopeTuner` renders the active preset's controls inside a shared `ControlSection`. Done looks like: the demo renders picker + tuner + mask/transform entirely from the package, `demo/src/{layer-controls,mask-panel,radio-toggles}.tsx` are deleted, a `LayerPatch` is addressed by id alone, and the copy-view-model button is web-only.

## Domain context

- **composite / layer / control.** Canonical kit nouns. A tunable layer's shader exposes **controls**; the editor renders them.
- **Controls are a composed component, not data.** Each book entry carries `controls?: ComponentType<KaleidoscopeControlsProps>` (a reference; the book stays `.ts`; a type-only React import keeps composites runtime-React-free). The Tuner renders it; `undefined` → nothing. Overriding a range is a JSX prop (`<Slider uniform="uScale" min={1.5} max={3} />`), not a data merge. No kind→component registry, no `withOverrides`.
- **The shared view model is the shader's uniform type.** `ShaderUniformsMap[shader]` (e.g. `CloudsUniforms`) is the one contract: the **preset** bakes values into it, a **control** emits `Partial` of it.
- **Form ownership (load-bearing — read before building Commits 4/7/8/9):**
  - `ControlForm<U>` is mounted **once per tunable layer by the composite's `<Composite>Controls` component**, seeded from that layer's baked uniforms. It owns the synchronous local view model the slider reads, and emits the **single shared, id-keyed** `onPatch({ id, uniforms })` it receives.
  - `<Shader>Controls` (e.g. `CloudsControls`) is a **provider-consumer fragment**: it assumes a `ControlForm` ancestor and is **not independently mountable** (rendering one without a `ControlForm` throws the `useField` no-ancestor error). The composite form supplies the provider.
  - **Reset is by remount, never by effect.** The Tuner renders the active controls component keyed by preset id (`<ActiveControls key={activeId} … />`), so switching presets — even between two presets that share a controls component type — unmounts and remounts, re-seeding every `ControlForm` from props. No `useEffect` syncs state to props.
- **`useField` and the type-flow.** React context is invariant, so a bare `useField` cannot infer the shader's uniform type. Each shader's controls module binds it with a factory: `const { Slider, ColorPicker, Field } = makeControls<CloudsUniforms>()`. The returned `Slider`'s `uniform` is constrained to `U`'s numeric keys, `ColorPicker`'s to `U`'s `RGB` keys; a typo (`uExpoure`) or a type mismatch (a scalar slider on an `RGB` uniform) is a compile error. Fields read their display value from the form synchronously; only the form's `onPatch` emit is debounced (trailing-edge flushed).
- **Controlled boundary.** The Tuner emits `onPatch`; the host calls `kaleidoscope(id, [patch])` — the same controlled seam as `KaleidoscopePicker`'s `onSelect`, and the seam the future native overlay channel plugs into.
- **Theming.** One `KaleidoscopeThemeProvider` holds a flat bank of `<slot>ClassName` + `<slot>Style` pairs (one pair per primitive, one per semantic state, shadcn-named). Primitives self-decorate `cn(defaults, theme.xClassName, localClassName)` / `style={[theme.xStyle, localStyle]}`; local wins; defaults unchanged when no provider. React-Native-Reusables `TextClassContext` precedent. The provider value must be memoized (this package is off the React Compiler). The theme module is a **leaf**: `src/controls/theme/*` imports only `react`, `react-native`, `nativewind` types, and `cn` — nothing from `controls/` siblings or `ui/`.
- **Import direction.** `./controls` must **never** import from `./ui`. `./ui` may import **only** the theme context from `./controls/theme` (so the picker shares the bank). That single edge is the allowed one.
- **Naming convention.** Turnkey, drop-in components carry the `Kaleidoscope` prefix (`KaleidoscopePicker`, `KaleidoscopeTuner`, `KaleidoscopeMaskControls`, `KaleidoscopeTransformControls`, `KaleidoscopeThemeProvider`). Low-level building blocks keep unbranded shadcn names (`ControlForm`, `makeControls`, `useField`, `ControlSection`, `Label`, `Readout`, `Slider`, `ColorPicker`, `Button`).

## Current surface area

| Item | Path | Disposition |
|------|------|-------------|
| `LayerPatch` (carries redundant `shader`) | `src/kaleidoscope/types.ts` | replace with `PatchesFor<P,K>` (shader re-indexed from the layer's literal shader); add `controls?` to the book-entry type; rewrite the `shader`-referencing JSDoc |
| `kaleidoscope(cmd, patches)` (ignores `patch.shader`) | `src/kaleidoscope/controls.ts` | generic per-call on `K`; runtime unchanged. `SetLayerUniforms` stays `Record<string, …>` deliberately (the id-keyed runtime channel is type-erased by design) |
| `LayerShaderOptions[S].uniforms` widened to `Record<string, …>` | `src/types.ts` | tighten to `Partial<ShaderUniformsMap[S]>` so bakes are type-checked |
| `ShaderUniformsMap`, `PatchableShaderName`, `defaultUniforms`, `LAYER_CONTROLS` | `src/shaders/index.ts` | `LAYER_CONTROLS` becomes the range/label seed for the `.controls.tsx` forms (update its JSDoc, which currently names the demo panel); `defaultUniforms` stays public; no `withOverrides` added |
| `UniformControl` (data: kind/default/range/doc) | `shaders/_shared/types.ts` | unchanged |
| Picker (unified by concurrent work) | `src/ui/picker/**` (`PresetGrid`, `PresetTile`) | retheme onto the provider; `selected` is the renamed style |
| NativeWind interop + parity test | `src/nativewind.ts`, `test/picker-nativewind-parity.test.ts` | register new primitives; generalize the test, scoping "styleable" to the **primitive** exports of both barrels (not providers/shells) |
| Library composites (data, `<name>.ts`, `as const satisfies`) | `composites/<name>/<name>.ts` | unchanged data; gain a sibling `.controls.tsx` component |
| Tunable shaders | `shaders/<name>/<name>.ts` + new `.controls.tsx` | shader ships its form fragment |
| Editor (demo-only) | `demo/src/{layer-controls,mask-panel,radio-toggles}.tsx`, `demo/app/index.tsx` | delete the three; demo consumes the package |
| Package exports + deps | `package.json` | add `./controls` (full conditions map); add `@react-native-community/slider` as an **optional** peer dep |

Out of scope (separate plans): the native Android/iOS live-uniform overlay channel (this plan only produces the patches it consumes); composite-level (whole-scene) copy; new exotic widgets (xy-pad) beyond the field-composition convention that makes them possible. No Storybook in this package — the demo and the parity test are the visual/contract gates.

## File structure: after

**Legend:** `+` created · `~` modified · `-` deleted

```
src/
├── types.ts                              ~ LayerShaderOptions.uniforms → Partial<ShaderUniformsMap[S]>
├── nativewind.ts                         ~ register new control primitives (inside registerKaleidoscopeNativeWind)
├── kaleidoscope/
│   ├── types.ts                          ~ LayerPatch → PatchesFor<P,K>; book entry gains controls?: ComponentType
│   └── controls.ts                       ~ kaleidoscope generic per-call on K
├── shaders/index.ts                      ~ LAYER_CONTROLS JSDoc update; no withOverrides
├── ui/picker/**                          ~ PresetGrid/PresetTile read theme slots from ./controls/theme
└── controls/                             + the new subpath
    ├── index.ts                          + barrel (extension-less relative imports only)
    ├── theme/{slots.ts, provider.tsx}    + KaleidoscopeThemeProvider, useKaleidoscopeTheme; leaf module
    ├── form/
    │   ├── control-form.tsx              + ControlForm<U> (useReducer; seeds from props; debounced, flushed onPatch)
    │   ├── use-field.ts                  + useField (raw); throws without a ControlForm ancestor
    │   └── make-controls.ts              + makeControls<U>() → typed Slider/ColorPicker/Field bound to U
    ├── primitives/{label,readout,slider,color-picker,button}.tsx  + self-theming; styleable set for the parity test
    ├── control-section.tsx               + title + slot + web-only copy button
    ├── tuner.tsx                         + KaleidoscopeTuner (renders preset.controls keyed by id; controlled)
    ├── mask-controls.tsx                 + KaleidoscopeMaskControls
    └── transform-controls.tsx            + KaleidoscopeTransformControls

shaders/<name>/<name>.controls.tsx        + <Shader>Controls fragment (makeControls<U>(); assumes a ControlForm ancestor)
composites/<name>/<name>.controls.tsx     + <Composite>Controls (mounts one ControlForm per tunable layer; inline overrides)

demo/
├── kaleidoscope.presets.ts               ~ each entry references its <Composite>Controls component
├── app/index.tsx                         ~ render packaged Picker + Tuner + mask/transform; wire onPatch
└── src/{layer-controls,mask-panel,radio-toggles}.tsx   - replaced by the package

package.json                              ~ add "./controls" export; add @react-native-community/slider optional peer
build-consumable-controls-ui.md           - deleted at completion (Inspector Gadget Rule)
```

## Commits

### Commit 1: Address the patch by layer id; drop the redundant `shader`

**Files rewritten:**
- `src/kaleidoscope/types.ts`: `PatchFor<L> = L extends { id: infer I extends string; shader: infer S extends PatchableShaderName } ? { readonly id: I; readonly uniforms: Partial<ShaderUniformsMap[S]> } : never` (re-indexes the map by the layer's literal `shader`); `PatchesFor<P,K> = ReadonlyArray<PatchFor<P[K]['layers'][number]>>`; `KaleidoscopeCommand` → `<K extends keyof P>(cmd: K | null, patches?: PatchesFor<P,K>)`. Rewrite the `LayerPatch` JSDoc so it no longer documents `shader`-for-narrowing. JSDoc the two tiers: literal `cmd` narrows to that preset's ids/uniforms; a variable `cmd` (the Tuner's path) degrades to the book-wide union, runtime-checked by id.
- `src/kaleidoscope/controls.ts`: `kaleidoscope` generic per-call on `K`; body unchanged. Leave `SetLayerUniforms` as `Record<string, number | readonly number[]>` (the runtime channel is intentionally type-erased; a comment says so).
- `demo/app/index.tsx`: `onLayerChange` emits `{ id, uniforms }`; remove the `shader` thread from `tunableLayersOf`; drop `import type { LayerPatch }` and the `as LayerPatch` cast — all here so the demo build stays green.

**Gate:** `bun run check`. Add two assertions: a literal-`cmd` call site narrows `uniforms` to the single shader's `Partial` (a wrong uniform key is a compile error); a variable-`cmd` call site type-checks against the union without `any`. Confirm all eight library composites are `as const satisfies Composite`; fix any that aren't here.

### Commit 2: Type-check baked uniforms against the shader's uniform type

**Files rewritten:**
- `src/types.ts`: each generative `LayerShaderOptions[S]` types `uniforms` as `Partial<ShaderUniformsMap[S]>`. Runtime unchanged.

**Audit folded into this commit:** grep every layer bake (demo book + 8 composites) and confirm its keys exist on the shader's `*Uniforms` type. `blur` (`sigma`) and `plasma` (`uColorA/uColorB/uSpeed/uScale`) are verified to conform; fix any stray key the tighten surfaces elsewhere in the same commit so it stays atomic.

**Gate:** `bun run check` passes.

### Commit 3: `./controls` subpath, theme provider, slot bank

**Files created:**
- `src/controls/theme/slots.ts`: `KaleidoscopeThemeSlots` — `<slot>ClassName?` + `<slot>Style?` pairs for primitives (`label`, `readout`, `slider`, `colorPicker`, `button`, `tabs`, `tile`, `section`) and states (`active`, `inactive`, `disabled`).
- `src/controls/theme/provider.tsx`: `KaleidoscopeThemeProvider`, `useKaleidoscopeTheme()`, `useThemeSlot(name)`. JSDoc: pass a memoized value (off the React Compiler). Leaf module — imports only `react`/`react-native`/`nativewind` types/`cn`.
- `src/controls/index.ts`: barrel seeded with the theme exports; later commits extend it. Relative imports stay extension-less (Metro house rule).

**Files rewritten:**
- `package.json`: add the full `./controls` conditions map (`types`, `react-native` → `src/controls/index.ts`, `browser`/`import`/`default` → `dist/...`, matching `./ui`); add `@react-native-community/slider` to `peerDependencies` as a floor (`^4.5.0`, must include the demo's `4.5.2`), mark it `peerDependenciesMeta: { optional: true }` (matching `nativewind`/`react-native-webrtc`), and add it as a devDependency pinned to `4.5.2` for the lib's own typecheck/build.

**Gate:** `bun run check` passes (`check:package` runs `publint --strict`; attw is not wired in the aggregator, so don't claim it).

### Commit 4: `ControlForm`, `useField`, and the `makeControls` factory

**Files created:**
- `src/controls/form/control-form.tsx`: `ControlForm<U>({ id, uniforms, onPatch, disabled?, debounceMs?, children })` — a `useReducer` over `U` seeded from `uniforms` at mount; provides `{ id, state, dispatch, disabled }` via context; emits debounced, **trailing-edge-flushed** `onPatch({ id, uniforms })`. Holds the synchronous value fields read. Reset is the parent's job via remount (`key`), not an effect here.
- `src/controls/form/use-field.ts`: raw `useField(key)` → `{ value, onChange, disabled }`; reads/writes the nearest `ControlForm`; throws a clear error with no provider ancestor.
- `src/controls/form/make-controls.ts`: `makeControls<U>()` → `{ Slider, ColorPicker, Field, useField }` where `Slider`'s `uniform` is constrained to `NumericKeys<U> = { [K in keyof U]: U[K] extends number ? K : never }[keyof U]`, `ColorPicker`'s to `RgbKeys<U> = { [K in keyof U]: U[K] extends RGB ? K : never }[keyof U]` (extends the `RGB` tuple, not `readonly number[]`), each wired to the nearest `ControlForm<U>`. This is the authoring-time typo/type-mismatch seam.

**Gate:** `bun run check`; unit tests: value updates synchronously; exactly one debounced patch per burst **and its payload is the last dispatched value** (trailing flush, no stale intermediate); a typed `makeControls<CloudsUniforms>().Slider` rejects a non-numeric or unknown `uniform` at compile time.

### Commit 5: Self-theming field primitives

**Files created:**
- `src/controls/primitives/{label,readout,slider,color-picker,button}.tsx`: each merges `cn(defaults, theme.<slot>ClassName, className)` and `style={[theme.<slot>Style, style]}`; keeps its current hard-coded `StyleSheet` defaults as the un-themed baseline; stateful ones overlay `active`/`inactive`/`disabled` at the container (mirrors `PresetTile`'s `selected && styles.selected`). `Slider` wraps `@react-native-community/slider` with the `safeSliderValue` zero-guard (port the explanatory comment); display reads the field value synchronously, only the form emit debounces. `ColorPicker` is v1-equivalent to today's `ColorRow`. Each field associates its `Label`/`Readout` with the control via `accessibilityLabel` (RN has no `htmlFor`).

**Files rewritten:**
- `src/controls/index.ts`: export the primitives + `makeControls`/`ControlForm`.
- `src/nativewind.ts`: `cssInterop` each primitive's `*ClassName` props to their `*Style` targets — **inside** `registerKaleidoscopeNativeWind()` (never at module scope, so `sideEffects: false` stays true).
- `test/picker-nativewind-parity.test.ts`: read both the `./ui` and `./controls` barrels, but scope the "styleable" set to the **primitive** components (the picker leaves + `src/controls/primitives/*`); providers/shells (`ControlForm`, `KaleidoscopeTuner`, `ControlSection`, `KaleidoscopeThemeProvider`, mask/transform) are PascalCase but must be **excluded**, else the bidirectional `registered === styleable` assertion fails. Barrel re-exports use `export { X } from './…'` so the extractor sees them.

**Gate:** `bun run check` passes (incl. the rescoped parity test); render smoke per primitive with and without a provider.

### Commit 6: `ControlSection` chrome with a web-only copy button

**Files created:**
- `src/controls/control-section.tsx`: title + a controls slot + a copy button that renders only when `Platform.OS === 'web'` and writes the form's view model (`roundForCopy` preserved) to `navigator.clipboard.writeText` (via `.catch(...)`, not try/catch). No `onCopy` prop, no clipboard dependency, no `.web.tsx` split — one inline `Platform.OS` guard.

**Files rewritten:**
- `src/controls/index.ts`: export `ControlSection`.

**Gate:** `bun run check` passes.

### Commit 7: `KaleidoscopeTuner` and the book-entry `controls` field

**Files rewritten:**
- `src/kaleidoscope/types.ts`: define and export `KaleidoscopeControlsProps` here (not in `tuner.tsx`) so the low-level book type does not take an inverted compile-time edge into the high-level UI module: `KaleidoscopeControlsProps = { uniforms: Readonly<Record<string, Readonly<Record<string, number | readonly number[]>>>>; onPatch: (p: { id: string; uniforms: Record<string, number | readonly number[]> }) => void; disabled?: boolean }` (the heterogeneous-layer view model is intentionally id-keyed and loosely typed at this boundary; per-shader typing is recovered inside each `<Shader>Controls` via `makeControls<U>()`). The book-entry type gains `controls?: ComponentType<KaleidoscopeControlsProps>` (type-only `import type { ComponentType } from 'react'`; data composites leave it unset). JSDoc the slot: canonical filler is a `<Composite>Controls`; the Tuner wraps it in a `ControlSection`, so the component must **not** add its own section chrome; `undefined` renders nothing.

**Files created:**
- `src/controls/tuner.tsx`: `KaleidoscopeTuner<P>({ presets, value, onPatch, disabled })` — for the active preset, derives the per-layer baked uniforms (from `presets[value].layers`, keyed by id) and renders `<ActiveControls key={value} uniforms={byLayerId} onPatch={onPatch} disabled={disabled} />` inside a `ControlSection`; renders nothing when `controls` is unset. Controlled: routes the single shared `onPatch` up; never calls `kaleidoscope`. Imports `KaleidoscopeControlsProps` from `../kaleidoscope/types`. `disabled` flows to fields via `ControlForm` context, not per-leaf prop relay.
- `src/controls/index.ts`: export `KaleidoscopeTuner` + `KaleidoscopeControlsProps`.

**Gate:** `bun run check` passes.

### Commit 8a: Author a shader's controls fragment

**Files created:**
- `shaders/clouds/clouds.controls.tsx`: `CloudsControls({ layerId })` — `const { Slider, ColorPicker } = makeControls<CloudsUniforms>()`, then the clouds fields (seeded labels/ranges from `CLOUDS_CONTROLS`). A **provider-consumer fragment**: it assumes a `ControlForm<CloudsUniforms>` ancestor and is not independently mountable (documented at the top of the file).

**Gate:** `bun run check` passes.

### Commits 8b–8j: The remaining shader fragments (same shape)

Each follows 8a for `plasma`, `godrays`, `fireflies`, `nebula`, `simianlights`, `anamorphic-lensflare`, `light-beams-and-motes`, `corporate-blobs`, `blur`. Separate atomic commits (clean blame; the executor may batch verbatim-identical ones if preferred, keeping green per commit).

**Gate (each):** `bun run check` passes.

### Commit 9a: Author a composite's turnkey controls

**Files created:**
- `composites/wizard-tower/wizard-tower.controls.tsx`: `WizardTowerControls(props: KaleidoscopeControlsProps)` — for each tunable layer mounts `<ControlForm key={id} id={id} uniforms={props.uniforms[id]} onPatch={props.onPatch} disabled={props.disabled}>` wrapping that layer's shader fragment (`sky` → `<CloudsControls layerId="sky" />`). All `ControlForm`s share the one `props.onPatch`; the `id` discriminates.

**Gate:** `bun run check` passes.

### Commits 9b–9i: The remaining composite forms (same shape)

Each follows 9a for `observation-deck`, `fairy-cave`, `underwater`, `nebula`, `simianlights`, `clouds`, `corporate-blobs`. **`corporate-blobs` demonstrates an inline override**: `<Slider uniform="uScale" min={1.5} max={3} />`. Image-only composites ship no controls file.

**Gate (each):** `bun run check` passes.

### Commit 10: Mask/transform components, picker retheme

**Files created:**
- `src/controls/mask-controls.tsx`: `KaleidoscopeMaskControls` (themed hardness/threshold in a `ControlSection`; preserve the mask `0.01` floor with its comment, distinct from the slider epsilon; emits `MaskInput`, controlled).
- `src/controls/transform-controls.tsx`: `KaleidoscopeTransformControls` (themed flip toggles + rotate selector; emits `TransformInput`, controlled).

**Files rewritten:**
- `src/ui/picker/**` (`PresetGrid`, `PresetTile`): read `tabs`/`tile`/`button`/`active`/`inactive` from `useKaleidoscopeTheme()` (imported from `./controls/theme`); default styling unchanged when no provider. This is the one allowed `./ui` → `./controls/theme` edge.
- `src/shaders/index.ts`: update `LAYER_CONTROLS`'s JSDoc (it no longer feeds a demo panel; it seeds the `.controls.tsx` field ranges).

**Gate:** `bun run check` passes.

(No `KaleidoscopeConsole`: a Picker + Tuner wrapper is a three-line consumer composition the demo writes inline; shipping it now is unused turnkey surface. Deferred until a second consumer asks.)

### Commit 11: Migrate the demo onto the package

**Files rewritten:**
- `demo/kaleidoscope.presets.ts`: each entry references its `<Composite>Controls` component (`controls: WizardTowerControls`). Stays `.ts` (references, no JSX).
- `demo/app/index.tsx`: wrap in `KaleidoscopeThemeProvider` (memoized value); render `KaleidoscopePicker` + `KaleidoscopeTuner` (wire `onPatch` → `controls.kaleidoscope(art, [patch])`) + `KaleidoscopeMaskControls` + `KaleidoscopeTransformControls`.

**Files deleted:**
- `demo/src/{layer-controls,mask-panel,radio-toggles}.tsx`.

**Gate:** `bun run check`; `bun run demo:web` renders picker + tuner; a slider edit updates the web composite live and smoothly (synchronous display, trailing-flushed emit); the copy button (web) puts the layer view model on the clipboard; switching presets re-seeds the form (no stale values).

### Commit 12: Extract the convention, delete this plan

- Add to `PATTERNS.md`: the canonical control contract — `ControlForm<U>` + `makeControls<U>()` + `useField`, the field contract, `ControlSection` chrome, view-model = `ShaderUniformsMap[shader]`, **form ownership** (composite mounts one `ControlForm` per layer; shader fragments are not standalone), **reset-by-remount**, the **import rule** (`./controls` must not import `./ui`; `./ui` imports only `./controls/theme`), theme leaf-purity, and the `<name>.controls.tsx` convention at both levels.
- Delete `build-consumable-controls-ui.md`.

**Gate:** `bun run check` passes. No references to the plan file remain.

## Verification checklist

- [ ] `LayerPatch` carries no `shader`; its JSDoc no longer mentions shader-narrowing; literal-`cmd` calls narrow, variable-`cmd` degrades without `any`; baked uniforms type-check against the shader type.
- [ ] `ControlForm` holds synchronous state; the slider reads its display value from `useField` (not a Tuner prop); the emit is debounced and trailing-flushed; reset is remount-by-`key`, no `useEffect` syncing state to props.
- [ ] `makeControls<CloudsUniforms>().Slider` rejects a non-numeric/unknown `uniform` at compile time; `ColorPicker` constrained to `RGB` keys.
- [ ] `<Shader>Controls` documented as provider-consumer-only (not standalone); `<Composite>Controls` mounts one `ControlForm` per tunable layer sharing one id-keyed `onPatch`.
- [ ] `KaleidoscopeControlsProps` is concretely typed and exported; `disabled` reaches fields via context, not per-leaf relay.
- [ ] `KaleidoscopeTuner` is controlled (emits `onPatch`), keys the controls component by preset id, renders nothing when `controls` is unset.
- [ ] Copy button renders only on web (`Platform.OS === 'web'`), uses `navigator.clipboard`, depends on no clipboard module.
- [ ] `KaleidoscopeThemeProvider` set once restyles all primitives; `className` and `style` both work; provider value memoized; picker reads the same slots; `theme/*` imports nothing from `controls/` siblings or `ui/`.
- [ ] `./controls` export has the full conditions map incl. `browser`; `@react-native-community/slider` is an **optional** peer (`peerDependenciesMeta`); no RHF; `check:package` clean.
- [ ] `./controls` never imports `./ui`; the parity test scopes "styleable" to primitives (providers/shells excluded) and passes.
- [ ] Demo renders only packaged components; the three demo editor files are deleted; `defaultUniforms`/`LAYER_CONTROLS` JSDoc not left stale.
- [ ] `bun run check` green; web demo verified by inspection.
- [ ] Plan file deleted (Inspector Gadget Rule).

## Answered questions

- **RHF:** dropped. State lives in `ControlForm` (`useReducer`); the live path has no submit/validation. Zod door stays open (validate in the reducer later).
- **How the Tuner gets controls:** a `controls` **component reference** on the book entry (not data, not a raw `ReactNode`) — book stays `.ts` (prebuild-safe), fields self-wire via `ControlForm` context. `undefined` → nothing.
- **Form ownership:** composite forms own one `ControlForm` per tunable layer; shader fragments are provider-consumers, not standalone-mountable; reset is remount-by-preset-id `key`, never an effect.
- **`useField` type-flow:** context is invariant, so a per-shader `makeControls<U>()` factory binds `U` and constrains each field's `uniform` to the matching keys — that is where the typo/type-mismatch is caught.
- **`KaleidoscopeControlsProps`:** id-keyed, loosely typed at the Tuner boundary (heterogeneous layers); per-shader typing recovered inside each `<Shader>Controls`.
- **Overrides:** JSX props on fields; no `withOverrides`, no `CompositeControls` data type, no kind registry.
- **Multi-value controls:** single `vecN` uniform (xy = `vec2`, color = `vec3`); the field packs the array.
- **Copy:** web-only (`Platform.OS`-gated, `navigator.clipboard`); no dependency, no `onCopy`; per-form scope; composite-level deferred.
- **Theming:** one slot-bank provider; primitives self-decorate; `readout` is its own slot (not `value`, the mutating field value); states applied at container level. Theme module is a leaf to avoid an `./ui → ./controls/theme → … → ./ui` cycle.
- **`@react-native-community/slider`:** library **optional** peer (matches the repo's peer convention); demo already declares `4.5.2`.
- **`KaleidoscopeConsole`:** cut (YAGNI; the demo composes Picker + Tuner inline).
- **Storybook:** none in this package; the demo + parity test are the gates.

## References

- React Native Reusables `TextClassContext` — the `cn(defaults, contextClass, localClassName)` precedence the theming copies.
- Concurrent `./ui` refactor (landed): unified `PresetGrid` + `PresetTile`, removed `BackgroundGrid`/`PresetOptions`/`PresetOption`/`RenderOption`/`renderOption`, renamed the selected style to `selected`, added composite `thumbnail` fields. Compatible; the themed `Button` supersedes the removed `PresetOption`.
- Future plan (unwritten): native Android/iOS live per-layer uniform overlay channel — consumes the `{ id, uniforms }` patches this plan produces.
