# Drop-in Picker Components (preset-driven, headless, NativeWind-ready)

**Status:** Draft
**Scope:** cross-stack
**Date:** 2026-05-27
**Last reviewed:** 2026-05-27
**Context:** Consumers (and our own demo) hand-roll the background/shader picker UI even though the library already knows the curated presets; ship it as reusable components so an adopting project drops them in. Implements #28; the native thumbnail piece also resolves the collapse/blank-tile demo bug.

## Goal

A consumer declares their preset book, imports a picker component, and gets a working art-effect menu with real thumbnails on every platform; no hand-rolled grid, no asset wiring. The library ships a Radix/Clerk-style headless component family: a drop-in tabbed composite plus the same pieces as standalone primitives, each stylable three ways (sensible defaults → `className` → render-prop slot). The core stays dependency-light; NativeWind support is an opt-in subpath the consumer wires into their own interop file. Done looks like: the demo renders the picker from `react-native-webrtc-kaleidoscope/ui` (not local components), thumbnails display on web and device, NativeWind classes style it in the demo, and the README advertises it as NativeWind-ready.

## Domain context

- **Picker** (the feature entity): a surface for choosing one of the consumer's presets.
- **Presets** (its children): the library's existing domain noun, the things a user selects. Grouped into **families** by their `shader` field (`background-image`, `blur`, `plasma`, …) for the tabbed view.
- **Family-keyed control dispatch**: a `background-image` preset renders as a thumbnail tile; every other family renders as an option button. This is polymorphic dispatch keyed by family, not a flag prop.
- **Thumbnail URI**: web already has a real asset URL in the preset's `source`; native has only the preset name, so it resolves the in-bundle copy (Android `file:///android_asset/backgrounds/<id>.webp`; iOS `Bundle.main` URL). No second copy of any image.
- **Styling tiers**: defaults out of the box; `className` (resolved by the consumer's NativeWind via an opt-in interop registration we ship); `style`; and a `renderTile`/`renderOption` slot for full BYO.

## Current surface area

| Path | Role | Change |
|---|---|---|
| `package.json` `exports` | subpath map (`.`, `./backgrounds`, `./backgrounds/<name>`, …) | add `./ui`, `./nativewind` |
| `package.json` `peerDependencies` / `peerDependenciesMeta` | expo, react-native, rn-webrtc (optional), … | add `nativewind` (optional) |
| `src/backgrounds/<name>.ts` / `.web.ts` / `.types.ts` | per-preset source: native = name, web = Asset URL | reference pattern for the resolver split; unchanged |
| `src/kaleidoscope/types.ts` | `Preset`, `PresetBook`, `ShaderName` | source of family grouping; read, not changed |
| `ios/KaleidoscopeModule/KaleidoscopeModule.swift` | Expo Module `Function`s | add `resolveBackgroundUri` |
| `android/.../KaleidoscopeModule.kt` | Expo Module `Function`s | add `resolveBackgroundUri` |
| `test/registry-parity.test.ts` | pins cross-platform `Function` parity | will assert the new function on both |
| `demo/src/background-menu.tsx`, `radio-toggles.tsx` | hand-rolled picker UI | replaced by the library components (dogfood) |
| `demo/app/index.tsx` | composes the demo screen | import picker from `react-native-webrtc-kaleidoscope/ui` |
| `demo/` config | no NativeWind | add NativeWind (babel, metro, tailwind, global.css) |
| `README.md` | library docs | document the picker + NativeWind-ready |

## File structure: after

**Legend:** `+` added, `~` modified.

```
src/
  ui/                                  # + new subpath ./ui
    index.ts                           # + public entry: named re-exports (the one allowed "barrel" — it's the subpath entry)
    nativewind.ts                      # + opt-in cssInterop registration (exported via ./nativewind)
    picker/
      index.tsx                        # + KaleidoscopePicker composite (tabbed kitchen sink) + use-picker hook
      layout.tsx                       # + tabbed zone container (titleZone / tabsZone / bodyZone)
      picker.types.ts                  # + shared types: PickerProps, PresetView, Family, render-prop signatures
      presets/                         # + domain folder: the presets being picked
        background-grid.tsx            # + background-family renderer (thumbnail tiles)
        preset-options.tsx             # + non-image-family renderer (buttons)
        preset-tile.tsx                # + leaf: one background tile (className + style + slot)
        preset-option.tsx              # + leaf: one option button (className + style + slot)
        background-grid.stories.tsx    # + web-testable stories
        preset-options.stories.tsx     # +
      resolve-background-uri.ts        # + native: calls the Expo module function
      resolve-background-uri.web.ts    # + web: returns the preset source URL as-is
      resolve-background-uri.types.ts  # + shared contract (no platform-package imports)
ios/KaleidoscopeModule/
  KaleidoscopeModule.swift             # ~ add resolveBackgroundUri Function
android/src/main/java/com/simiancraft/kaleidoscope/
  KaleidoscopeModule.kt                # ~ add resolveBackgroundUri Function
test/
  registry-parity.test.ts             # ~ parity now includes resolveBackgroundUri
demo/
  app/index.tsx                        # ~ consume react-native-webrtc-kaleidoscope/ui
  src/background-menu.tsx              # (deleted — replaced by library component)
  src/radio-toggles.tsx               # (deleted — replaced by library component)
  tailwind.config.js                   # + NativeWind
  global.css                           # + NativeWind
  nativewind-env.d.ts                  # +
  babel.config.js                      # ~ nativewind preset / jsxImportSource
  metro.config.js                      # ~ withNativeWind
  app/_layout.tsx or entry             # ~ import global.css; import ./nativewind interop registration
package.json                           # ~ exports + optional nativewind peer
README.md                              # ~ picker components + NativeWind-ready
drop-in-picker-components.md           # (this file; deleted in the final commit)
```

## Commits

### Commit 1: scaffold the `./ui` subpath and shared types

**Files created:** `src/ui/index.ts` (empty/typed stub re-export), `src/ui/picker/picker.types.ts` (`PickerProps`, `PresetView = { id; label; family; source }`, `Family`, `RenderTile`/`RenderOption` signatures; zero runtime platform-package imports).
**Files modified:** `package.json` exports (add `./ui` mirroring the `.` condition shape: `react-native` → `src/ui/index.ts`, `browser`/`import`/`default` → dist, `types` → dist d.ts).
**Gate:** `bun run lint && bun run typecheck && bun run knip` pass; `bun run build` emits the new subpath.

### Commit 2: leaf parts (`preset-tile`, `preset-option`) + stories

**Files created:** `src/ui/picker/presets/preset-tile.tsx`, `preset-option.tsx`, plus `.stories.tsx`. Each: presentational, one state, accepts `className` + `style`, no chassis-level flag props; selection shown by a named-zone swap, not a `selected`-flag ternary buried in JSX. Render-prop escape hatch honored here.
**Gate:** full JS gate; stories render (web).

### Commit 3: family renderers (`background-grid`, `preset-options`) + dispatch

**Files created:** `src/ui/picker/presets/background-grid.tsx` (tiles; fixed-height tiles so RN doesn't collapse the way the demo did), `preset-options.tsx` (buttons). Family→renderer is a declarative dispatch table, not inline ternaries.
**Files modified:** `picker.types.ts` if the renderer contract needs a shared shape.
**Gate:** full JS gate; stories render.

### Commit 4: composite `KaleidoscopePicker` + `use-picker` + layout

**Files created:** `src/ui/picker/index.tsx` (composite + `usePicker` orchestration: group the book by `shader`, controlled `value`/`onSelect` with uncontrolled fallback), `src/ui/picker/layout.tsx` (tab chrome as named zones).
**Files modified:** `src/ui/index.ts` (export the public surface: `KaleidoscopePicker`, `BackgroundGrid`, `PresetOptions`, `PresetTile`, `PresetOption`, types).
**Gate:** full JS gate; a story renders the full composite over a mock book.

### Commit 5: `resolveBackgroundUri` platform-split (web side live)

**Files created:** `resolve-background-uri.web.ts` (`(id, source) => source`), `resolve-background-uri.ts` (native: `(id) => requireNativeModule(...).resolveBackgroundUri(id)`), `resolve-background-uri.types.ts` (shared signature). `background-grid` consumes it.
**Gate:** full JS gate; web story shows real thumbnails (source URLs).

### Commit 6: opt-in NativeWind interop subpath

**Files created:** `src/ui/nativewind.ts` — calls `cssInterop` (from `nativewind`) once per exported component, mapping `{ className: { target: 'style', nativeStyleToProp: { ... } } }` (the shape the consumer's own interop declarations use), so `className` resolves to each component's style target plus any forwardable props. Documented as "import this once in your NativeWind interop file." Component files themselves never import `nativewind`; they accept a `className` string and merge it after their defaults (consumer's classes last, winning) without pulling `clsx`/`tailwind-merge` into core.
**Files modified:** `package.json` (`./nativewind` subpath; `nativewind` as optional peer + `peerDependenciesMeta`), `knip.json` if needed.
**Gate:** full JS gate; the core (`./ui`) still imports zero `nativewind` (only `./nativewind` does); `bun run build` succeeds without nativewind installed at the core path.

### Commit 7: demo dogfood + NativeWind setup (WEB TEST GATE)

**Files modified:** `demo/app/index.tsx` (consume `react-native-webrtc-kaleidoscope/ui`), demo NativeWind config (`tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `babel.config.js`, `metro.config.js`, entry importing `global.css` and the `./nativewind` registration), `demo/package.json` (add `nativewind`).
**Files deleted:** `demo/src/background-menu.tsx`, `demo/src/radio-toggles.tsx`.
**Gate:** `bun run typecheck:demo`; **Playwright web run** of the demo: thumbnails display, picker selects, NativeWind classes apply. This is the web verification milestone.

### Commit 8: native `resolveBackgroundUri` on both platforms

**Files modified:** `ios/KaleidoscopeModule/KaleidoscopeModule.swift` (`Function("resolveBackgroundUri")` → `Bundle.main.url(forResource: id, withExtension: "webp")?.absoluteString`), `android/.../KaleidoscopeModule.kt` (`Function("resolveBackgroundUri")` → `"file:///android_asset/backgrounds/$id.webp"`), `test/registry-parity.test.ts` (parity includes the new function).
**Gate:** `bun test` (parity green), `check:android` (`JAVA_HOME=17`) BUILD SUCCESSFUL, `assembleDebug`. iOS compiles only on EAS.

### Commit 9: README — picker components + NativeWind-ready

**Files modified:** `README.md` (usage of the composite + primitives, the three styling tiers, the `./nativewind` opt-in import, NativeWind-ready badge/section).
**Gate:** full JS gate; links resolve.

### Commit 10: the single EAS pass (device verification)

Kick off one EAS `preview` build (both platforms) from the committed branch; device-verify native thumbnails, the dogfooded picker, and that the rest still works. Fix any break, re-verify, rebuild. (Not a code commit; the gate is "both EAS builds FINISHED and device-confirmed.")

### Commit 11: delete this plan

**Files deleted:** `drop-in-picker-components.md`.
**Gate:** `git status` clean; feature shipped.

## Verification checklist

- [ ] `./ui` and `./nativewind` resolve as subpaths; core `./ui` imports no `nativewind`.
- [ ] Composite + each primitive render in Storybook/web over a mock book.
- [ ] `className`, `style`, and render-prop each style a tile/option.
- [ ] Web demo (Playwright): thumbnails display, selection works, NativeWind classes apply.
- [ ] `resolveBackgroundUri` exists on both natives; parity test green.
- [ ] `check:android` + `assembleDebug` green; APK still packages the curated WebPs.
- [ ] One EAS `preview` build per platform FINISHED; device shows real native thumbnails.
- [ ] README documents the components + NativeWind opt-in.

## Anti-patterns / scope boundaries

- **Out of scope (v1):** `transform` (flip/rotate) and `mask` (slider) panels. Primitives make them opt-in later.
- **No second image copy.** Native thumbnails resolve the already-bundled asset; the demo must not bundle its own thumbnail copies.
- **Core stays style-agnostic.** Only `./nativewind` imports `nativewind`. No NativeWind in `./ui`.
- **No chassis-level flag relay** on leaves (`selected`/`disabled` drive zone swaps, not buried ternaries), per house style.

## References

- Issue #28 (the picker spec + the two design comments: native URI resolver, NativeWind).
- Issue #34 (transform/shader stacking limitation; orthogonal, ships separately).
- `src/backgrounds/*.ts` / `.web.ts` / `.types.ts` (the platform-split pattern this mirrors).
