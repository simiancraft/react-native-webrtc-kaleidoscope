#!/usr/bin/env bun
// GLSL -> SPIR-V -> MSL transpiler. Reads `.frag` and `.vert` files under
// `shaders/` and writes `.metalsrc` files into `ios/KaleidoscopeModule/shaders/`.
//
// Pipeline:
//   1. glslangValidator -V -S {frag,vert} input.{frag,vert} -o temp.spv
//   2. spirv-val temp.spv (sanity-check SPIR-V output)
//   3. spirv-cross --msl --output output.metal temp.spv
//
// Tool requirements (system binaries via apt on Debian/Ubuntu/WSL):
//   sudo apt install -y glslang-tools spirv-tools spirv-cross
// On macOS: brew install glslang spirv-tools spirv-cross.
//
// The committed `.metalsrc` files are what the iOS build consumes. The
// transpiler runs at dev time (or in a `bun run check:shaders` lane that
// verifies the committed Metal output is fresh against the GLSL source).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { $ } from 'bun';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const GLSL_DIR = join(REPO_ROOT, 'shaders');
const METAL_OUT_DIR = join(REPO_ROOT, 'ios/KaleidoscopeModule/shaders');
const TMP_DIR = join(REPO_ROOT, '.shader-tmp');

const REQUIRED_TOOLS = ['glslangValidator', 'spirv-val', 'spirv-opt', 'spirv-cross'] as const;

async function whichOrFail(): Promise<void> {
  const missing: string[] = [];
  for (const tool of REQUIRED_TOOLS) {
    try {
      await $`which ${tool}`.quiet();
    } catch {
      missing.push(tool);
    }
  }
  if (missing.length === 0) return;
  console.error(`Missing required tools: ${missing.join(', ')}`);
  console.error('');
  console.error('Install via:');
  console.error(
    '  sudo apt install -y glslang-tools spirv-tools spirv-cross   # Debian/Ubuntu/WSL',
  );
  console.error('  brew install glslang spirv-tools spirv-cross                # macOS');
  process.exit(2);
}

async function transpileOne(filename: string): Promise<void> {
  const { name, ext } = parse(filename);
  const stage = ext === '.frag' ? 'frag' : ext === '.vert' ? 'vert' : null;
  if (!stage) {
    console.warn(`  skip: ${filename} (unknown extension ${ext})`);
    return;
  }
  const inputPath = join(GLSL_DIR, filename);
  const preprocessedPath = join(TMP_DIR, filename);
  const spvPath = join(TMP_DIR, `${name}.spv`);
  const optSpvPath = join(TMP_DIR, `${name}.opt.spv`);
  const metalPath = join(METAL_OUT_DIR, `${name}.metalsrc`);

  // 0. Preprocess for the SPIR-V path. The canonical .frag/.vert files are
  // GLSL ES 3.00 with a leading comment header (matching the WebGL2 and
  // Android GLES 3.0 runtimes). glslangValidator's ES profile is stricter:
  //   - #version must be the literal first token (no comments before it),
  //   - GLSL ES -> SPIR-V requires #version 310 es or higher.
  // Both are transpile-only concerns; 3.10 is a strict superset of 3.00 for
  // the constructs we use (texture(), smoothstep, mix, clamp, uniform
  // arrays, in/out varyings), so the emitted MSL is equivalent. We rewrite
  // a temp copy and feed that to glslang; the committed source stays 3.00.
  const rawSrc = readFileSync(inputPath, 'utf8');
  const fromVersion = rawSrc.replace(/^[\s\S]*?(#version)/, '$1');
  const bumped = fromVersion.replace('#version 300 es', '#version 310 es');
  writeFileSync(preprocessedPath, bumped);

  // 1. GLSL -> SPIR-V under OpenGL semantics (`-G`). Our canonical source is
  // OpenGL-ES-style: bare non-opaque uniforms (vec2/float), no UBO blocks,
  // no explicit layout(binding=). Vulkan SPIR-V (`-V`) rejects all three;
  // OpenGL SPIR-V (`-G`) accepts them, and spirv-cross's MSL backend
  // consumes OpenGL-flavored SPIR-V fine. `--auto-map-bindings` /
  // `--auto-map-locations` fill in the binding/location decorations
  // spirv-cross needs to assign MSL [[texture(n)]] / [[buffer(n)]] /
  // [[stage_in]] slots. Validates syntax, types, uniforms.
  await $`glslangValidator -G --auto-map-bindings --auto-map-locations -S ${stage} ${preprocessedPath} -o ${spvPath}`.quiet();

  // 2. Validate the SPIR-V (catches malformed output between tools).
  await $`spirv-val ${spvPath}`.quiet();

  // 3. Optimize the SPIR-V (dead-code elimination, constant folding,
  // simplification). spirv-cross's MSL output is cleaner from optimized
  // input, and the round-trip catches any pathological constructs.
  await $`spirv-opt -O ${spvPath} -o ${optSpvPath}`.quiet();

  // 4. SPIR-V -> MSL. --msl-version 20100 targets Metal 2.1 (iOS 12+; safe
  // floor since our podspec requires iOS 15). --emit-line-directives
  // preserves source-line mapping for Metal-side debugger.
  await $`spirv-cross --msl --msl-version 20100 --emit-line-directives --output ${metalPath} ${optSpvPath}`.quiet();

  console.log(`  ok:   ${filename}  ->  ${metalPath.replace(REPO_ROOT, '.')}`);
}

async function main(): Promise<void> {
  await whichOrFail();

  if (!existsSync(GLSL_DIR)) {
    console.error(`shaders/ directory not found at ${GLSL_DIR}`);
    process.exit(2);
  }

  mkdirSync(METAL_OUT_DIR, { recursive: true });
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const files = readdirSync(GLSL_DIR).filter((f) => f.endsWith('.frag') || f.endsWith('.vert'));
  if (files.length === 0) {
    console.error(`No .frag or .vert files found under ${GLSL_DIR}`);
    process.exit(2);
  }

  console.log(`Transpiling ${files.length} shader(s) GLSL -> SPIR-V -> MSL`);
  for (const file of files) {
    try {
      await transpileOne(file);
    } catch (err) {
      console.error(`  fail: ${file}`);
      console.error(err);
      process.exit(1);
    }
  }

  // Write a tiny stamp the host can read to know which shader bodies are
  // baked into the committed metallib. Useful for diffing in PRs.
  const stamp = files.sort().join('\n');
  writeFileSync(join(METAL_OUT_DIR, 'SHADERS.txt'), `${stamp}\n`);

  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('Done.');
}

main();
