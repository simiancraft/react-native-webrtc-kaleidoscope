# Background presets

Bundled example backgrounds for the `background-image` effect. Import a single
preset and pass it as the effect's `source`:

```ts
import { applyVideoEffects } from 'react-native-webrtc-kaleidoscope';
import { office1 } from 'react-native-webrtc-kaleidoscope/backgrounds/office-1';

applyVideoEffects(track, [{ name: 'background-image', source: office1 }]);
```

`office1` resolves per platform:

- **Web:** the bundled WebP's URL, which the effect fetches and uploads as a texture.
- **Native (iOS/Android):** the preset name (`'office-1'`); the native module
  loads its own bundled copy from native resources.

The barrel re-exports every preset:

```ts
import { office1, office2 } from 'react-native-webrtc-kaleidoscope/backgrounds';
```

Prefer the per-preset path (`/backgrounds/office-1`) over the barrel. Metro does
not tree-shake, so importing the barrel pulls every preset's WebP into your
bundle; a per-preset import pulls only what you use.

For a non-Expo web bundler, import the asset URL directly:

```ts
import office1Url from 'react-native-webrtc-kaleidoscope/backgrounds/office-1.webp';
```

## Optimal background: size, shape, format

A background is composited behind the segmented subject and sampled with bilinear
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
  while still landing well under ~100 KB for typical scenes. Lossless is the
  wrong tool here: on photographic content it lands near the original PNG size.

The shipped presets were produced from 1536x1024 source art with ImageMagick:

```sh
convert in.png -resize "1280x720^" -gravity center -extent 1280x720 \
  -quality 88 -define webp:method=6 office-1.webp
```

## Adding a preset

1. Append the name to `BACKGROUND_PRESETS` in `presets.ts`.
2. Drop the optimized `<name>.webp` here (recipe above).
3. Add a `<name>.ts` loader mirroring `office-1.ts`, and re-export it from `index.ts`.
4. Add the `./backgrounds/<name>` and `./backgrounds/<name>.webp` entries to the
   package `exports`.
5. For native support, add `<name>.png` under `android/src/main/assets/backgrounds/`
   and `ios/KaleidoscopeModule/resources/backgrounds/`, and register the factory
   on each native side.
