# Image presets

Bundled background plates for `image` layers. An `image` layer is one entry in a
composite's layer stack: `{ id, shader: 'image', source }`, where `source` is the
plate. Import a preset and use it as that `source` (and, usually, as the
composite's `thumbnail`):

```ts
import type { PresetBook } from 'react-native-webrtc-kaleidoscope';
import { darkOffice } from 'react-native-webrtc-kaleidoscope/images/dark-office';

export const presets = {
  'dark-office': {
    name: 'Dark Office',
    category: 'Backgrounds',
    thumbnail: darkOffice,
    layers: [
      { id: 'dark-office', shader: 'image', source: darkOffice },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
} as const satisfies PresetBook;
```

The bundled plates (the catalog lives in `presets.ts` as `BACKGROUND_PRESETS`)
are `debug-resolutions` (a viewport/resolution calibration grid for verifying
cover-fit) plus ten themed backgrounds: `dark-office`, `light-office`,
`home-light`, `home-dark`, `nature-light`, `nature-dark`, `sci-fi-light`,
`underwater-dark`, `simiancraft-light`, and `simiancraft-dark`. The packaged
composites under `composites/` bundle a few more plates of their own
(`wizards-tower`, `observation-deck`, `fairy-treehouse`).

`darkOffice` resolves per platform via a build-time file split (`dark-office.ts`
for native, `dark-office.web.ts` for web, with the shared contract in
`preset-source.types.ts`); the bundler picks the variant, there is no runtime
`Platform.OS` branch:

- **Web:** the bundled WebP's URL, which the compositor fetches and uploads as a
  texture for the `image` layer.
- **Native (iOS/Android):** the plate id (`'dark-office'`); the native module
  loads its own bundled copy by that id. The native variant imports no WebP and
  no expo-asset, so native bundles neither at the source level. At `expo prebuild`
  the config plugin reads your preset book, finds the `image` layers it actually
  references, and copies just those WebPs into the native bundle under
  `assets/images/<id>.webp`.

An `image` layer's `id` doubles as the native plate id, so it must match the
plate's WebP basename. The barrel exports the catalog, not the sources:

```ts
import { BACKGROUND_PRESETS, type BackgroundPresetName } from 'react-native-webrtc-kaleidoscope/images';
```

Sources are imported per preset on purpose. Metro does not tree-shake, so a
per-preset import is the only way to pull just the WebP you use.

For a non-Expo web bundler, import the asset URL directly:

```ts
import darkOfficeUrl from 'react-native-webrtc-kaleidoscope/images/dark-office.webp';
```

You are not limited to the bundled plates. On web an `image` layer's `source` can
be any image URL or data URI; on native, supply your own WebP and let the prebuild
copy it (the demo's `wolf-cave` preset does exactly this with a `require()`'d
asset the plugin resolves statically).

## Optimal plate: size, shape, format

A plate is composited behind the segmented subject and sampled with bilinear
filtering and no mipmaps, so resolution beyond the output video size is discarded;
it costs decode time, memory, and upload bandwidth without improving the picture.
Smaller, well-sized assets shorten load and switch latency; they do not change
steady-state shader cost (once uploaded, the file format is invisible to the GPU).

Target:

- **Resolution:** 1280x720. Matches typical WebRTC output. Go to 1920x1080 only
  if your source art genuinely has that many pixels; upscaling produces a soft,
  not crisp, 1080p.
- **Shape:** 16:9, the call's aspect. Center-crop other ratios so the runtime
  does not stretch or letterbox.
- **Format:** lossy WebP, no alpha (a full-frame background needs none). WebP is
  supported across the targets this library runs on.
- **Quality:** ~q88. High enough to avoid banding on smooth walls and gradients,
  while still landing well under ~100 KB for typical plates. Lossless is the
  wrong tool here: on photographic content it lands near the original PNG size.

The shipped office plates were produced from 1536x1024 source art with ImageMagick:

```sh
convert in.png -resize "1280x720^" -gravity center -extent 1280x720 \
  -quality 88 -define webp:method=6 dark-office.webp
```

## Thumbnails

The preset book references a small thumbnail per composite (the picker tile), not
the full plate. Shipping the 1280x720 plate as its own `thumbnail` wastes decode
time and memory on a tile that renders ~160px wide. Each plate folder carries a
downscaled `<name>.thumb.webp` next to the plate.

Target:

- **Resolution:** **320x180** (16:9), center-cropped to fill. Uniform across every
  thumbnail so picker tiles are one shape regardless of the source's aspect (the
  plates themselves vary: 16:9 backgrounds, 3:2 composites). Crisp to ~160px at 2x
  DPR; a picker tile never needs more.
- **Format:** lossy WebP at ~q80 (a tile tolerates more compression than a
  full-frame background), `method=6`.
- **Crop:** center-cropped cover-fit (`-extent`), not a letterboxed fit, so the
  tile is filled. A non-16:9 source loses a little off the long edge.
- **Naming:** `<name>.thumb.webp`, in the same `images/<name>/` folder as the plate.

Recipe (cover-fit to 320x180, center-cropped):

```sh
convert <source> -resize "320x180^" -gravity center -extent 320x180 \
  -quality 80 -define webp:method=6 <name>.thumb.webp
```

A screenshot you are turning into a thumbnail (a captured "world" or "sky") takes
the same recipe; feed the source image in place of `<source>`.

## Adding a plate

1. Append the name to `BACKGROUND_PRESETS` in `presets.ts`.
2. Create `images/<name>/` and drop the optimized `<name>.webp` in it (recipe above).
3. Make its `<name>.thumb.webp` (Thumbnails recipe above) and reference it as the
   composite's `thumbnail` instead of the full plate.
4. Add the loader pair mirroring `dark-office`: `<name>.ts` (native, returns the
   plate id) and `<name>.web.ts` (web, returns the WebP URL), both annotated with
   `PresetSource` from `preset-source.types.ts`.
5. Add the `./images/<name>` export (with `react-native`, `browser`,
   `import`, `default` conditions) and `./images/<name>.webp` to the
   package `exports`.

No native registration is needed. The one registered native effect is
`composite`; plates are data, not factories. The prebuild copies only the plates
your book references, and the native side resolves them by id at runtime.
