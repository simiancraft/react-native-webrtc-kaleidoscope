#!/usr/bin/env bun
// Chroma-strip: replace a flat matte color in an image with transparency, like a
// green-screen key. Give it an image whose cut-out region is painted a single
// matte color (magenta #FF00FF by default) and it writes a WebP with that color
// turned to pure alpha. Hard key: a pixel within --fuzz of the key color becomes
// fully transparent, everything else stays fully opaque (no edge feather).
//
// Backed by ImageMagick (`magick`/`convert`): `-fuzz N% -transparent <color>` is
// the keying primitive; --fuzz is the tolerance that absorbs compression noise
// and slight gradients in the matte. Output is lossless WebP so the alpha edge
// stays crisp.
//
// A glowing matte bleeds a gradient of the key color onto the surrounding edge;
// the darkest of those fringe pixels sit in the scene's own color neighborhood,
// so --fuzz cannot reach them without also keying the scene. --shrink removes
// that fringe by geometry: it grows the transparent hole a couple px past the
// key edge. Reach for it when you see a thin colored "crust" on the boundary.
//
// ── VERIFIED RECIPE (what has actually worked here) ─────────────────────────
// For AI-rendered "portal" plates (a saturated magenta disc glowing inside a
// dark cave), `--fuzz 30 --shrink 2` produced clean cutouts with zero fringe.
//   - The matte is NOT one flat value: sampling found magenta spanning
//     R 230-246, G 0-4, B 153-219 across plates. Sample the matte and key its
//     MIDPOINT color, not a single eyedropped pixel, so --fuzz reaches both
//     ends of the spread symmetrically. (Per-plate keys used so far:
//     #F102C1 and #EE02A5.)
//   - --fuzz 30 keys the body of the matte. --shrink 2 then erodes the dark
//     glow fringe that --fuzz structurally cannot take (see above).
//   - DEAD END to avoid: do not chase the fringe with --fuzz alone. Raising it
//     far enough to clear the fringe ballooned the transparent area from ~7.6%
//     (the portal) to ~30% (eating the cave). Higher --fuzz, then --shrink.
//
// ── HOW TO CONFIRM SUCCESS (an LLM can run these) ───────────────────────────
//   1. Transparent %: this script prints it. It should ≈ the area you meant to
//      cut. A jump well above that means --fuzz is eating the scene; back off.
//   2. Leftover-crust count (catches DARK fringe a brightness test misses) —
//      count non-transparent magenta-HUE pixels (green well below red AND blue):
//        magick OUT -channel RGBA \
//          -fx 'a>0.5 && g<r && g<b && (r-g)>0.08 && (b-g)>0.08 && r>0.12 ? 1 : 0' \
//          -alpha off -colorspace gray -format '%[fx:round(mean*w*h)]' info:
//      0 == clean. (A bright-only test like `g<0.3 && b>0.45` will read 0 even
//      when a dark fringe remains — that mistake happened; use the hue test.)
//   3. Eyeball it: composite over a flat contrasting color and zoom the edge:
//        magick OUT -background '#00b140' -flatten over.png
//
// Usage:
//   bun run scripts/chroma-strip.ts <input> [--color '#FF00FF'] [--fuzz 10] [--shrink 0] [--out path.webp]
//
// Examples:
//   bun run scripts/chroma-strip.ts art/portal.png
//   bun run scripts/chroma-strip.ts art/portal.png --color '#00FF00' --fuzz 6
//   bun run scripts/chroma-strip.ts art/portal.png --fuzz 30 --shrink 2   # eat the glow fringe
//   bun run scripts/chroma-strip.ts art/portal.png --out demo/assets/backgrounds/portal.webp

import { existsSync } from 'node:fs';
import { join, parse } from 'node:path';
import { $ } from 'bun';

const DEFAULT_COLOR = '#FF00FF'; // magenta
const DEFAULT_FUZZ = 10; // percent tolerance around the key color
const DEFAULT_SHRINK = 0; // px to grow the transparent region after keying

type Args = {
  input: string;
  color: string;
  fuzz: number;
  shrink: number;
  out: string;
};

function usage(): never {
  console.error(
    [
      'Usage: bun run scripts/chroma-strip.ts <input> [--color <hex>] [--fuzz <percent>] [--shrink <px>] [--out <path>]',
      '',
      `  --color   matte color to strip (default ${DEFAULT_COLOR}). Hex (#RRGGBB or RRGGBB) or a named color.`,
      `  --fuzz    tolerance percent around the color (default ${DEFAULT_FUZZ}). Higher = strips more.`,
      `  --shrink  grow the transparent region by N px after keying (default ${DEFAULT_SHRINK}). Eats the thin`,
      '            keyed-color fringe a glowing matte leaves at the edge, without raising --fuzz into the scene.',
      '  --out     output path (default <input>.cutout.webp). Always written as lossless WebP.',
    ].join('\n'),
  );
  process.exit(2);
}

// Normalize a color token for ImageMagick: bare 6-hex-digit strings get a '#';
// anything else (named colors, already-#-prefixed, srgb(...)) passes through.
function normalizeColor(raw: string): string {
  return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : raw;
}

function parseArgs(argv: readonly string[]): Args {
  let input: string | undefined;
  let color = DEFAULT_COLOR;
  let fuzz = DEFAULT_FUZZ;
  let shrink = DEFAULT_SHRINK;
  let out: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage();
    else if (a === '--color') color = argv[++i] ?? usage();
    else if (a === '--fuzz') fuzz = Number(argv[++i]);
    else if (a === '--shrink') shrink = Number(argv[++i]);
    else if (a === '--out') out = argv[++i] ?? usage();
    else if (a?.startsWith('--')) {
      console.error(`Unknown flag: ${a}`);
      usage();
    } else if (input === undefined) input = a;
    else {
      console.error(`Unexpected extra argument: ${a}`);
      usage();
    }
  }

  if (!input) usage();
  if (!Number.isFinite(fuzz) || fuzz < 0 || fuzz > 100) {
    console.error(`--fuzz must be a number in [0, 100]; got ${fuzz}`);
    usage();
  }
  if (!Number.isInteger(shrink) || shrink < 0 || shrink > 50) {
    console.error(`--shrink must be an integer in [0, 50]; got ${shrink}`);
    usage();
  }

  // Default output: alongside the input, basename + .cutout.webp.
  const p = parse(input);
  const resolvedOut = out ?? join(p.dir || '.', `${p.name}.cutout.webp`);

  return { input, color: normalizeColor(color), fuzz, shrink, out: resolvedOut };
}

// Prefer ImageMagick 7's `magick`; fall back to v6's `convert`.
async function resolveMagick(): Promise<string> {
  for (const bin of ['magick', 'convert']) {
    try {
      await $`which ${bin}`.quiet();
      return bin;
    } catch {
      // try next
    }
  }
  console.error('ImageMagick not found. Install it:');
  console.error('  sudo apt install -y imagemagick   # Debian/Ubuntu/WSL');
  console.error('  brew install imagemagick          # macOS');
  process.exit(2);
}

async function main(): Promise<void> {
  const { input, color, fuzz, shrink, out } = parseArgs(Bun.argv.slice(2));

  if (!existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }

  const magick = await resolveMagick();

  // Optional matte shrink: erode the alpha by a disk so the transparent hole
  // grows by `shrink` px, swallowing the thin keyed-color fringe a glowing
  // matte leaves at the edge. A glow gradient puts the darkest fringe pixels in
  // the same color neighborhood as the scene, so they cannot be reached by
  // --fuzz without also keying the scene; eroding the edge removes them by
  // geometry instead. Empty (no-op) when shrink is 0.
  const shrinkOps =
    shrink > 0 ? ['-channel', 'A', '-morphology', 'Erode', `Disk:${shrink}`, '+channel'] : [];

  // The ImageMagick pipeline, token by token (order matters — operators apply
  // left to right to the image in flight):
  //   ${input}                 read the source image.
  //   -alpha set               ensure an alpha channel exists to write into
  //                            (a source with no alpha, e.g. a flat PNG/JPEG,
  //                            otherwise has nothing for -transparent to set).
  //   -fuzz N%                 color-match tolerance for the NEXT operator. N%
  //                            is a fraction of the full color range; bigger N
  //                            treats more near-by colors as "the same".
  //   -transparent <color>     set every pixel within -fuzz of <color> to alpha
  //                            0. This is the chroma key itself (hard/binary:
  //                            matched -> fully transparent, else untouched).
  //   ${shrinkOps}             optional `-channel A -morphology Erode Disk:S
  //                            +channel` (see above): grows the transparent
  //                            hole by S px to eat the glow fringe. Empty at S=0.
  //   -define webp:lossless=true  encode WebP losslessly so the keyed alpha edge
  //                            has no compression halo (lossy WebP would smear
  //                            color into the now-transparent region).
  //   ${out}                   write; format is inferred from the extension
  //                            (we always hand it .webp).
  try {
    await $`${magick} ${input} -alpha set -fuzz ${`${fuzz}%`} -transparent ${color} ${shrinkOps} -define webp:lossless=true ${out}`.quiet();
  } catch (err) {
    console.error(`ImageMagick failed keying ${input}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (!existsSync(out)) {
    console.error(`Expected output was not written: ${out}`);
    process.exit(1);
  }

  // Report the transparent fraction as the success guard (confirm #1 above).
  //   -alpha extract        pull the alpha channel out as a grayscale image
  //                         (white = opaque 1.0, black = transparent 0.0).
  //   -format %[fx:mean]    print its mean in [0,1] = the mean alpha.
  //   info:                 emit only that computed value, write no file.
  // transparent fraction = 1 - mean alpha. It should land near the area you
  // intended to cut; far above means --fuzz ate the scene, ~0 means the key
  // matched nothing (wrong --color or too-small --fuzz). Best-effort only.
  let transparentPct = '?';
  try {
    const mean = await $`${magick} ${out} -alpha extract -format ${'%[fx:mean]'} info:`
      .quiet()
      .text();
    const t = 1 - Number(mean);
    if (Number.isFinite(t)) transparentPct = `${(t * 100).toFixed(1)}%`;
  } catch {
    // report is best-effort; ignore
  }

  const shrinkNote = shrink > 0 ? ` shrink ${shrink}px` : '';
  console.log(`chroma-strip: ${input}`);
  console.log(
    `  key ${color} @ fuzz ${fuzz}%${shrinkNote}  ->  ${out} (${transparentPct} transparent)`,
  );
}

main();
