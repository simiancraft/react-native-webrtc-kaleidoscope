#!/usr/bin/env bun
// Shader build: one canonical GLSL source in `shaders/`, three runtime outputs.
//
//   - iOS:     transpile every .frag/.vert -> MSL (.metalsrc) via
//              glslangValidator -> spirv-opt -> spirv-cross. ShaderLibrary.swift
//              compiles the .metalsrc at runtime.
//   - Android: generate gpu/ShadersGenerated.kt (Kotlin const-val strings).
//   - Web:     generate web-driver/shaders.generated.ts (exported string consts).
//
// Only the CROSS-RUNTIME shared shaders are code-generated for Android/web (see
// SHARED_CODEGEN). Platform-local shaders (Android's OES external-texture and
// 2D passthrough) stay hand-written. iOS transpiles every shader in shaders/.
//
// Generated files are committed; `bun run check:shaders` re-runs this and fails
// if any committed artifact is stale. Never hand-edit the generated files.
//
// GATE COVERAGE CAVEAT: check:shaders diffs only the Android .kt and web .ts
// codegen, not the iOS .metalsrc (spirv-cross output varies by toolchain
// version, so diffing the MSL would false-positive in CI). For the shared
// shaders this is safe: a stale .frag still trips the .kt/.ts diff. But the
// iOS-only shaders (nebula.frag, simianlights.frag) are in neither codegen list
// and have no gated artifact, so editing one without re-running build:shaders
// would leave a stale .metalsrc that the gate cannot catch. Those two are
// staged for the procedural-shader handler (a later PR); until they are wired
// into a gated path, treat a build:shaders run as mandatory after touching
// them, and rely on the iOS build to surface a transpile failure.
//
// Tool requirements (system binaries):
//   sudo apt install -y glslang-tools spirv-tools spirv-cross   # Debian/Ubuntu/WSL
//   brew install glslang spirv-tools spirv-cross                # macOS

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, parse } from 'node:path';
import { $ } from 'bun';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// Canonical shader source tree: folder-per-shader (`shaders/<name>/<name>.frag`)
// plus the cross-pipeline shared files in `shaders/_shared/`. The codegen lists
// and the transpile loop key on the bare filename (e.g. `composite-camera.frag`), so
// the tree is flattened to a filename -> absolute-path map up front; basenames
// are unique across the tree.
const GLSL_DIR = join(REPO_ROOT, 'catalog', 'shaders');

// Walk the shader tree and index every .frag/.vert by its basename. Throws if
// two folders carry the same basename (the codegen lists address shaders by
// basename, so a collision would make resolution ambiguous).
function indexShaderSources(dir: string): Map<string, string> {
  const byName = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.frag') && !entry.endsWith('.vert')) continue;
      const existing = byName.get(entry);
      if (existing) {
        throw new Error(
          `Duplicate shader basename '${entry}' at ${existing} and ${full}; basenames must be unique.`,
        );
      }
      byName.set(entry, full);
    }
  };
  walk(dir);
  return byName;
}
const METAL_OUT_DIR = join(REPO_ROOT, 'ios/KaleidoscopeModule/shaders');
const ANDROID_OUT = join(
  REPO_ROOT,
  'android/src/main/java/com/simiancraft/kaleidoscope/gpu/ShadersGenerated.kt',
);
const WEB_OUT = join(REPO_ROOT, 'web-driver/shaders.generated.ts');
const TMP_DIR = join(REPO_ROOT, '.shader-tmp');

// Code-generation targets, in deterministic emit order. iOS transpiles
// everything in shaders/ regardless; these lists pick which shaders also get
// code-generated into the Android Kotlin and web TS layers.
//
// Utility shaders differ per platform: transform.frag is native-only (web
// reorients in display space via canvas, so its const would be dead code on
// web). The generative set is SHARED: every generative is single-sourced into
// both platforms, because the live per-platform consumers (Android
// LayerShaders.GENERATIVE, web LAYER_SHADER_SOURCES) read the generated
// registry directly.
const UTILITY_ANDROID = [
  'passthrough.vert',
  'composite-camera.frag',
  'composite-blur.frag',
  'composite-image.frag',
  'composite-subject.frag',
  'composite-masked.frag',
  'transform.frag',
] as const;
const UTILITY_WEB = [
  'passthrough.vert',
  'composite-camera.frag',
  'composite-blur.frag',
  'composite-image.frag',
  'composite-subject.frag',
  'composite-masked.frag',
] as const;

// Generative background shaders: the ones the generic shader processor runs
// (animated, no input sampling). This is the ONE list. Adding a generative
// .frag here single-sources it into the Android GENERATIVE map, the web
// SHADER_SOURCES registry, and iOS GENERATIVE.txt; the live per-platform
// consumers read those, so no hand edit per platform is needed (plus the .frag
// and its option contract). Utility shaders (blur, composite, transform) are
// not generative and stay out.
const GENERATIVE_SHADERS = [
  'plasma.frag',
  'kaleidoscope.frag',
  'neo-memphis.frag',
  'halftone-waves.frag',
  'aurora-silk.frag',
  'outrun-grid.frag',
  'clouds.frag',
  'nebula.frag',
  'godrays.frag',
  'fireflies.frag',
  'simianlights.frag',
  'anamorphic-lensflare.frag',
  'light-beams-and-motes.frag',
  'corporate-blobs.frag',
] as const;

const ANDROID_CODEGEN = [...UTILITY_ANDROID, ...GENERATIVE_SHADERS] as const;
const WEB_CODEGEN = [...UTILITY_WEB, ...GENERATIVE_SHADERS] as const;
const ALL_CODEGEN = Array.from(new Set<string>([...ANDROID_CODEGEN, ...WEB_CODEGEN]));

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

// Drop the leading comment header so generated/transpiled output starts at the
// literal `#version` token (glslang's ES profile requires it; the web/Android
// inlined consts have always started here too).
function stripToVersion(raw: string): string {
  return raw.replace(/^[\s\S]*?(#version)/, '$1');
}

// passthrough.vert -> PASSTHROUGH_VERT, composite-camera.frag ->
// COMPOSITE_CAMERA_FRAG. Hyphens in the basename map to
// underscores so the const stays a valid Kotlin/TS identifier; the transpiled
// .metalsrc keeps the hyphenated filename.
function constBase(filename: string): string {
  const { name, ext } = parse(filename);
  const stage = ext === '.vert' ? 'VERT' : 'FRAG';
  return `${name.toUpperCase().replace(/-/g, '_')}_${stage}`;
}

async function transpileOne(filename: string, inputPath: string): Promise<void> {
  const { name, ext } = parse(filename);
  const stage = ext === '.frag' ? 'frag' : ext === '.vert' ? 'vert' : null;
  if (!stage) {
    console.warn(`  skip: ${filename} (unknown extension ${ext})`);
    return;
  }
  const preprocessedPath = join(TMP_DIR, filename);
  const spvPath = join(TMP_DIR, `${name}.spv`);
  const optSpvPath = join(TMP_DIR, `${name}.opt.spv`);
  const metalPath = join(METAL_OUT_DIR, `${name}.metalsrc`);

  // GLSL ES -> SPIR-V requires #version 310 es or higher; 3.10 is a strict
  // superset of 3.00 for the constructs we use, so the emitted MSL is
  // equivalent. We bump a temp copy; the committed source stays 3.00.
  const bumped = stripToVersion(readFileSync(inputPath, 'utf8')).replace(
    '#version 300 es',
    '#version 310 es',
  );
  writeFileSync(preprocessedPath, bumped);

  // `-G` (OpenGL SPIR-V) accepts our bare non-opaque uniforms and no UBO
  // blocks, which Vulkan `-V` would reject; spirv-cross's MSL backend consumes
  // it fine. auto-map fills the binding/location decorations MSL needs.
  await $`glslangValidator -G --auto-map-bindings --auto-map-locations -S ${stage} ${preprocessedPath} -o ${spvPath}`.quiet();
  await $`spirv-val ${spvPath}`.quiet();
  await $`spirv-opt -O ${spvPath} -o ${optSpvPath}`.quiet();
  // --msl-version 20100 targets Metal 2.1 (safe floor; podspec requires iOS 15).
  await $`spirv-cross --msl --msl-version 20100 --emit-line-directives --output ${metalPath} ${optSpvPath}`.quiet();

  console.log(`  ok:   ${filename}  ->  ${metalPath.replace(REPO_ROOT, '.')}`);
}

// Kotlin raw strings interpolate `$`; GLSL never uses it, but escape defensively.
function emitAndroid(sources: Map<string, string>): void {
  const consts = ANDROID_CODEGEN.map((file) => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Kotlin raw-string escape for '$', not a JS placeholder
    const body = (sources.get(file) as string).replace(/\$/g, "${'$'}");
    return `  const val ${constBase(file)} = """${body}"""`;
  }).join('\n\n');

  const generative = GENERATIVE_SHADERS.map(
    (file) => `    "${parse(file).name}" to ${constBase(file)},`,
  ).join('\n');

  const out = `// @generated by scripts/build-shaders.ts from shaders/. DO NOT EDIT.
// Run \`bun run build:shaders\` to regenerate.
//
// Cross-runtime shared shaders. Platform-local shaders (OES external texture,
// 2D passthrough) stay hand-written in Shaders.kt, which delegates the consts
// below.

package com.simiancraft.kaleidoscope.gpu

internal object ShadersGenerated {
${consts}

  // Generative background shaders, by name. The generic shader processor and
  // directory-driven registration iterate this; adding a generative .frag adds
  // an entry here automatically.
  val GENERATIVE: Map<String, String> = mapOf(
${generative}
  )
}
`;
  writeFileSync(ANDROID_OUT, out);
  console.log(`  gen:  Android  ->  ${ANDROID_OUT.replace(REPO_ROOT, '.')}`);
}

// TS template literals interpret backtick, backslash, and `${`; GLSL uses none,
// but escape defensively so a future shader can't break codegen.
function emitWeb(sources: Map<string, string>): void {
  const consts = WEB_CODEGEN.map((file) => {
    const body = (sources.get(file) as string)
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
    return `export const ${constBase(file)}_SRC = \`${body}\`;`;
  }).join('\n\n');

  const registry = GENERATIVE_SHADERS.map(
    // Quote the key: hyphenated names (anamorphic-lensflare) are not valid bare
    // object keys.
    (file) => `  '${parse(file).name}': ${constBase(file)}_SRC,`,
  ).join('\n');

  const out = `// @generated by scripts/build-shaders.ts from shaders/. DO NOT EDIT.
// Run \`bun run build:shaders\` to regenerate.

${consts}

// Generative background shaders, by name. The generic shader processor and the
// dispatch iterate this; adding a generative .frag adds an entry here.
export const SHADER_SOURCES: Readonly<Record<string, string>> = {
${registry}
} as const;
`;
  writeFileSync(WEB_OUT, out);
  console.log(`  gen:  web      ->  ${WEB_OUT.replace(REPO_ROOT, '.')}`);
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

  const sourceIndex = indexShaderSources(GLSL_DIR);
  const files = Array.from(sourceIndex.keys());
  if (files.length === 0) {
    console.error(`No .frag or .vert files found under ${GLSL_DIR}`);
    process.exit(2);
  }

  // 1. iOS: transpile every shader to MSL.
  console.log(`Transpiling ${files.length} shader(s) GLSL -> SPIR-V -> MSL`);
  for (const file of files) {
    try {
      await transpileOne(file, sourceIndex.get(file) as string);
    } catch (err) {
      console.error(`  fail: ${file}`);
      console.error(err);
      process.exit(1);
    }
  }

  // 2. Android + web: code-generate the shared set.
  const sources = new Map<string, string>();
  for (const file of ALL_CODEGEN) {
    const path = sourceIndex.get(file);
    if (!path) {
      console.error(`codegen lists ${file} but it was not found under ${GLSL_DIR}`);
      process.exit(2);
    }
    sources.set(file, stripToVersion(readFileSync(path, 'utf8')));
  }
  emitAndroid(sources);
  emitWeb(sources);

  // 3. Stamp the iOS bundle with the shader list (PR-diff aid), and emit the
  // generative-shader names so iOS registration is data-driven (reads this at
  // runtime and registers one generic processor per name); the iOS analogue of
  // the Android GENERATIVE map. Adding a generative .frag updates this list.
  writeFileSync(join(METAL_OUT_DIR, 'SHADERS.txt'), `${files.sort().join('\n')}\n`);
  writeFileSync(
    join(METAL_OUT_DIR, 'GENERATIVE.txt'),
    `${GENERATIVE_SHADERS.map((f) => parse(f).name)
      .sort()
      .join('\n')}\n`,
  );

  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('Done.');
}

main();
