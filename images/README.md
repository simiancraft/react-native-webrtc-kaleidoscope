# Image plates

Bundled plates for `image` layers. An `image` layer is one entry in a composite's
layer stack: `{ id, shader: 'image', source }`, where `source` is the plate.
Import a plate and use it as that `source` (and, usually, as the composite's
`thumbnail`):

```ts
import type { PresetBook } from 'react-native-webrtc-kaleidoscope';
import { officeDark } from 'react-native-webrtc-kaleidoscope/images/office/office-dark';

export const presets = {
  'office-dark': {
    name: 'Dark Office',
    taxonomy: ['Backgrounds', 'Office'],
    thumbnail: officeDark,
    layers: [
      { id: 'office-dark', shader: 'image', source: officeDark },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
} as const satisfies PresetBook;
```

## Folder layout: one folder per category, one plate per leaf

Plates are filed by **category** (the plate's taxonomy, i.e. the picker's
second-level group), not one folder per image. A category folder holds one or
more plates, and each plate is a **quad** of same-named files:

```
images/<category>/
  <leaf>.webp         the plate art
  <leaf>.thumb.webp   the 320x180 picker tile (same basename + .thumb)
  <leaf>.ts           native loader (returns the plate id)
  <leaf>.web.ts       web loader (returns the bundled WebP URL)
```

The `<leaf>` is the plate id. It is **globally unique** across all categories
because it doubles as both the native bundle basename (`assets/images/<leaf>.webp`)
and the `image` layer's `id`. The categories that ship today:

| Category | Plates |
|----------|--------|
| `office` | `office-dark`, `office-light` |
| `home` | `home-dark`, `home-light` |
| `nature` | `landscape-dark`, `landscape-light` |
| `sci-fi` | `sci-fi-light` |
| `underwater` | `oceanscape-dark` |
| `simiancraft` | `simiancraft-light`, `simiancraft-dark`, `simiancraft-light-transparency`, `simiancraft-dark-transparency` |
| `corporate` | `corporate-logo` |
| `debug` | `debug-resolutions` (a viewport/resolution calibration grid) |
| `fairy-caves` | `grotto`, `hollow`, `treehouse`, `treehouse-2`, `treehouse-3` |
| `spaceship` | `observation-deck` |
| `wizard-tower` | `wizard-tower-1`, `wizard-tower-2`, `wizard-tower-night` |

`presets.ts` lists the standalone-background plates as `BACKGROUND_PRESETS` (the
`office`/`home`/`nature`/`sci-fi`/`underwater`/`simiancraft`/`corporate`/`debug`
leaves), which types a consumer's `source` autocomplete. The `fairy-caves`,
`spaceship`, and `wizard-tower` cutout plates are not standalone backgrounds; they
are layered inside the packaged composites under `composites/`.

## Platform split, tree-shaking

`officeDark` resolves per platform via a build-time file split (`office-dark.ts`
for native, `office-dark.web.ts` for web, with the shared contract in
`preset-source.types.ts`); the bundler picks the variant, there is no runtime
`Platform.OS` branch:

- **Web:** the bundled WebP's URL, which the compositor fetches and uploads as a
  texture for the `image` layer.
- **Native (iOS/Android):** the plate id (`'office-dark'`); the native module
  loads its own bundled copy by that id. The native variant imports no WebP and
  no expo-asset, so native bundles neither at the source level. At `expo prebuild`
  the config plugin reads your preset book, finds the `image` layers it actually
  references, and copies just those WebPs into the native bundle under
  `assets/images/<leaf>.webp`.

Each plate is its own loader pair behind its own `./images/<category>/<leaf>`
subpath export, and the package sets `sideEffects: false`, so a web bundler drops
any plate you do not import. Metro does not tree-shake, so a per-plate import is
the only way to pull just the WebP you use; import per plate on purpose. The
barrel exports the catalog, not the sources:

```ts
import { BACKGROUND_PRESETS, type BackgroundPresetName } from 'react-native-webrtc-kaleidoscope/images';
```

For a non-Expo web bundler, import the asset URL directly:

```ts
import officeDarkUrl from 'react-native-webrtc-kaleidoscope/images/office/office-dark.webp';
```

You are not limited to the bundled plates. On web an `image` layer's `source` can
be any image URL or data URI; on native, supply your own WebP and let the prebuild
copy it (the demo's `wolf-cave` preset does exactly this with a `require()`'d
asset the plugin resolves statically).

## Plate format: two kinds

A plate is composited behind the segmented subject and sampled with bilinear
filtering and no mipmaps, so resolution beyond the output video size is discarded;
it costs decode time, memory, and upload bandwidth without improving the picture.
Smaller, well-sized assets shorten load and switch latency; they do not change
steady-state shader cost (once uploaded, the file format is invisible to the GPU).
Two plate kinds drive two encodings:

### Opaque background plate (no alpha)

A full-frame background. The default and the common case.

- **Resolution:** 1280x720. Matches typical WebRTC output. Go to 1920x1080 only
  if your source art genuinely has that many pixels.
- **Shape:** 16:9, the call's aspect. Center-crop other ratios so the runtime
  does not stretch or letterbox.
- **Format:** lossy WebP, no alpha. Lossless is the wrong tool here: on
  photographic content it lands near the original PNG size.
- **Quality:** ~q88. No banding on smooth walls and gradients, still well under
  ~150 KB for a typical plate.

```sh
convert in.png -resize "1280x720^" -gravity center -extent 1280x720 \
  -quality 88 -define webp:method=6 office-dark.webp
```

`debug-resolutions` is the deliberate exception: a high-detail calibration grid
kept crisp (~750 KB), not a photographic background.

### Alpha plate (transparency)

A plate with transparent regions: a cutout that lets a lower layer (the night sky,
a shader) show through, or a logo. Keep the alpha; never flatten it.

- **Photographic cutout** (the `fairy-caves`, `spaceship`, `wizard-tower` scenes):
  lossy WebP at ~q88 with alpha preserved. Keep the source aspect (these are often
  3:2 or 16:9); the compositor cover-fits, so the exact aspect is not load-bearing.

  ```sh
  convert in.png -resize "1280x720^" -gravity center -background none -extent 1280x720 \
    -quality 88 -define webp:method=6 treehouse-2.webp
  ```

- **Flat logo / brand art** (the `simiancraft-*-transparency` plates): lossy color
  with **lossless alpha**, so the transparency edges stay crisp while the flat
  field compresses cheaply. True lossless on the whole image balloons past 500 KB
  for no visible gain.

  ```sh
  convert in.png -resize "1280x720^" -gravity center -background none -extent 1280x720 \
    -quality 90 -define webp:alpha-quality=100 -define webp:method=6 \
    simiancraft-dark-transparency.webp
  ```

## Thumbnails

Every plate carries a downscaled `<leaf>.thumb.webp` beside it: the picker tile,
not the full plate. Shipping the 1280x720 plate as its own `thumbnail` wastes
decode time and memory on a tile that renders ~160px wide.

- **Resolution:** **320x180** (16:9), center-cropped to fill. Uniform across every
  thumbnail so picker tiles are one shape regardless of the plate's aspect.
- **Format:** lossy WebP at ~q80, `method=6`. Alpha plates keep `-background none`.
- **Naming:** `<leaf>.thumb.webp`, in the same `images/<category>/` folder, same
  basename as the plate.

```sh
convert <plate> -resize "320x180^" -gravity center -extent 320x180 \
  -quality 80 -define webp:method=6 <leaf>.thumb.webp
```

## Adding a plate

1. Pick or create the category folder `images/<category>/`.
2. Drop the optimized `<leaf>.webp` in it (pick the encoding for its kind, above).
3. Make its `<leaf>.thumb.webp` (recipe above).
4. Add the loader pair mirroring `office-dark`: `<leaf>.ts` (native, returns the
   plate id) and `<leaf>.web.ts` (web, returns the WebP URL), both annotated with
   `PresetSource` from `preset-source.types.ts`.
5. Add the `./images/<category>/<leaf>` export (with `react-native`, `browser`,
   `import`, `default` conditions) and `./images/<category>/<leaf>.webp` to the
   package `exports`.
6. If it is a standalone background, append `<leaf>` to `BACKGROUND_PRESETS` in
   `presets.ts`. Cutout plates that only feed a packaged composite skip this.

No native registration is needed. The one registered native effect is
`composite`; plates are data, not factories. The prebuild copies only the plates
your book references, and the native side resolves them by id at runtime.
