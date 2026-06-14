# Shaders: adding and extending

Canonical GLSL lives here, one folder per shader, as the single source of truth
across web, Android, and iOS. `bun run build:shaders` codegens the web and
Android sources from these `.frag` files and transpiles the iOS Metal; the
generated outputs are never hand-edited. This folder is the place to add a new
generative layer shader (`plasma`, `clouds`, `godrays`, and the rest are here).

For the deeper architecture (the texture-orientation contract, the
codegen/transpile pipeline, the native registry), see
[`../PATTERNS.md`](../PATTERNS.md). This file is the practical how-to.

## Layout (one folder per shader)

```
shaders/
├── _shared/                 # cross-cutting: passthrough.vert, the composite-* layer frags, transform.frag, types.ts
└── <name>/
    ├── <name>.frag          # the canonical GLSL ES 3.00 fragment (single source)
    ├── <name>.ts            # the typed uniforms + the <NAME>_CONTROLS descriptor
    └── <name>.presets.md    # optional: documented uniform presets / looks
```

All shaders share one vertex stage (`_shared/passthrough.vert`); there is no
per-shader `.vert`.

## The shader contract

A generative layer is **background-source-agnostic**: the compositor runs
`mix(background, original, mask)` and does not care that your shader produced the
background. So your `.frag`:

- samples nothing of its own orientation; the frame arrives display-upright and
  non-mirrored (orientation is normalized once at the ingest, never per effect),
  so you write `rotation 0` and add no flips. A flip or rotate inside a shader is
  always an ingest bug, fixed there, not here.
- receives the host built-ins `uTime` (seconds) and `uResolution` (vec2 px), plus
  your own `u`-prefixed uniforms.
- composites correctly on every platform with zero orientation code; only its raw
  compute cost varies by device, handled by the resolution tier, not by you.

## Adding a shader

1. **GLSL**: `catalog/shaders/<name>/<name>.frag`. Write the fragment against the
   contract above.
2. **Types + control descriptor**: `catalog/shaders/<name>/<name>.ts`:
   - `export type <Name>Uniforms = { … }` (each uniform; colors are `RGB`,
     scalars are `number`). This is the single source for the layer's view model.
   - `export const <NAME>_CONTROLS: readonly UniformControl[]`: one entry per
     tunable uniform with `name`, `kind` (`'float'` | `'color'`), `default`,
     range (`min`/`max`/`step` for floats), and a `doc` string. This descriptor
     is what drives the editor (see "Controls come free" below) and documents the
     uniform for editors and LLMs.
3. **Register the shader** (three small edits, no native `Registration` change):
   - `src/types.ts`: add `<name>: { uniforms: Partial<ShaderUniformsMap['<name>']> }`
     to `LayerShaderOptions` (the closed catalog the `KaleidoscopeLayer` discriminant
     narrows on).
   - `src/shaders/index.ts`: import the `<Name>Uniforms` type, add
     `<name>: <Name>Uniforms` to `ShaderUniformsMap`, and re-export both
     `<Name>Uniforms` (type) and `<NAME>_CONTROLS` (value) for consumers.
   - `web-driver/effects/layer-shaders.ts`: map `<name>` to its generated
     `<NAME>_FRAG_SRC` const in `LAYER_SHADER_SOURCES` (the web compositor and the
     native compositors dispatch on the name; there is no per-effect file).
4. **Codegen**: `bun run build:shaders`, then commit the regenerated web/Android
   sources. CI's `bun run check:shaders` regenerates and `git diff --exit-code`s
   the deterministic codegen, so a `.frag` edit pushed without regenerating fails
   the build.

A new shader is now usable as a layer in any composite (`{ id, shader: '<name>',
uniforms }`).

## Controls come free

A shader's `<NAME>_CONTROLS` descriptor is all the editor needs. A composite's
controls form renders it with one line:

```tsx
import { CompositeLayerControlPanel } from 'react-native-webrtc-kaleidoscope/preset-control-panel';
import { CLOUDS_CONTROLS } from 'react-native-webrtc-kaleidoscope/composites/clouds';
// inside a ControlForm + ControlSection for the layer:
<CompositeLayerControlPanel controls={CLOUDS_CONTROLS} />
```

`CompositeLayerControlPanel` maps each descriptor entry to a themed `Slider` (float) or
`ColorPicker` (color). To hide a knob, filter the array; to narrow a range for a
preset, pass `overrides={{ uName: { min, max } }}`. **No per-shader UI file is
needed** for the built-in `float`/`color` kinds.

### Custom widgets (a control beyond float/color)

If a uniform deserves a bespoke control (an x/y pad, a polygon editor), add a
`catalog/catalog/shaders/<name>/<name>.controls.tsx` and build it with the typed factory so the
`uniform` prop is checked against your shader's type:

```tsx
import { makeControls } from 'react-native-webrtc-kaleidoscope/preset-control-panel';
import type { <Name>Uniforms } from './<name>';

const { Slider, ColorPicker } = makeControls<<Name>Uniforms>();
// <Slider uniform="uExposure" min={0.2} max={1.5} />  // uniform key + value type checked
```

The custom widget is a self-wiring field: it reads/writes the nearest
`ControlForm` via `useField` and emits a `Partial` of the shader's uniforms. A
typo'd or wrong-typed `uniform` is a compile error.

## Toolchain (iOS transpile only)

The iOS Metal is transpiled `GLSL -> SPIR-V -> MSL` by `scripts/build-shaders.ts`.
Contributors who do not touch shaders need none of this (the check is CI-only).
If you do edit a `.frag`:

- Debian/Ubuntu/WSL: `sudo apt install -y glslang-tools spirv-tools spirv-cross`
- macOS: `brew install glslang spirv-tools spirv-cross`

## Cost (relative GPU budget)

Each shader carries a `// Cost:` line in its `<name>.ts` so the price is visible
where you pick presets. Use it to decide what to ship, and to drop the expensive
ones on mobile or slow devices (e.g. "nothing above MODERATE on phones").

**The portable number is `x plasma`, not the milliseconds.** Plasma is the
cheapest shader and is re-measured as the anchor on every bench run, so the ratio
is roughly device-independent; the absolute ms is one desktop iGPU at one
resolution and does **not** transfer to a phone. Rank and budget by the ratio.

**Rubric** (multiples of plasma, the floor):

| Tier | x plasma | Read it as |
|------|---------:|------------|
| CHEAP | < 5x | ship anywhere, including low-end mobile |
| MODERATE | 5–25x | fine on most devices; one at a time on weak GPUs |
| HEAVY | 25–100x | desktop / strong mobile; gate behind a capability check |
| VERY-HEAVY | > 100x | desktop-class only, or accept a low frame rate |

**Ranking** (shader:view GPU-time meter, 1920x1080, Intel UHD 770, each at its
`.ts` default uniforms, 2026-06-14; plasma anchor held ~0.29 ms across all runs):

| Shader | ms/draw | x plasma | Tier |
|--------|--------:|---------:|------|
| light-beams-and-motes | 142 | ~490x | VERY-HEAVY |
| clouds | 70 | ~240x | VERY-HEAVY |
| fireflies | 18 | ~61x | HEAVY |
| nebula | 15 | ~51x | HEAVY |
| corporate-blobs | 12 | ~42x | HEAVY |
| simianlights | 11 | ~39x | HEAVY |
| data-mesh | 6.4 | ~22x | MODERATE |
| aurora-silk | 1.9 | ~6.5x | MODERATE |
| neo-memphis | 1.0 | ~3.4x | CHEAP |
| kaleidoscope | 0.96 | ~3.3x | CHEAP |
| anamorphic-lensflare | 0.91 | ~3.1x | CHEAP |
| godrays | 0.68 | ~2.4x | CHEAP |
| outrun-grid | 0.53 | ~1.8x | CHEAP |
| halftone-waves | 0.45 | ~1.6x | CHEAP |
| plasma | 0.35 | 1x | CHEAP |

**Caveats.** The meter runs each `.frag` at full meter resolution; at runtime,
effects render at the resolution tier (much lower) and some run reduced-resolution
passes (clouds is half-res in the live pipeline), so real device cost is a
fraction of these numbers. Cost also moves with uniforms (mote count, raymarch
steps, grid density), so a specific preset can land in a neighbouring tier. The
`composite-*` and `blur` primitives are excluded: they sample the camera texture,
so they cannot be metered standalone (`blur` is a full-res 13-tap in the pipeline).

**Keeping it current.** These numbers are filled in by hand today. The intent is a
`bench` tool (the analog of the thumbnail maker) that drives the shader:view meter
headless, co-measures plasma, derives the ratio and tier, and writes the `Cost:`
line — so a new shader gets benched the same way it gets a thumbnail. Because the
ms is GPU-specific, the tool stamps the rig and date and the committed signal is
the ratio.
