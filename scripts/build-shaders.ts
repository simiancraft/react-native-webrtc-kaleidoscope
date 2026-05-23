#!/usr/bin/env bun
// Shader build: one canonical GLSL source in `shaders/`, three runtime outputs.
//
//   - iOS:     transpile every .frag/.vert -> MSL (.metalsrc) via
//              glslangValidator -> spirv-opt -> spirv-cross. ShaderLibrary.swift
//              compiles the .metalsrc at runtime.
//   - Android: generate gpu/ShadersGenerated.kt (Kotlin const-val strings).
//   - Web:     generate src/web/shaders.generated.ts (exported string consts).
//
// Only the CROSS-RUNTIME shared shaders are code-generated for Android/web (see
// SHARED_CODEGEN). Platform-local shaders (Android's OES external-texture and
// 2D passthrough) stay hand-written. iOS transpiles every shader in shaders/.
//
// Generated files are committed; `bun run check:shaders` re-runs this and fails
// if any committed artifact is stale. Never hand-edit the generated files.
//
// Tool requirements (system binaries):
//   sudo apt install -y glslang-tools spirv-tools spirv-cross   # Debian/Ubuntu/WSL
//   brew install glslang spirv-tools spirv-cross                # macOS

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { $ } from 'bun';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const GLSL_DIR = join(REPO_ROOT, 'shaders');
const METAL_OUT_DIR = join(REPO_ROOT, 'ios/KaleidoscopeModule/shaders');
const ANDROID_OUT = join(
  REPO_ROOT,
  'android/src/main/java/com/simiancraft/kaleidoscope/gpu/ShadersGenerated.kt',
);
const WEB_OUT = join(REPO_ROOT, 'src/web/shaders.generated.ts');
const TMP_DIR = join(REPO_ROOT, '.shader-tmp');

// The shaders shared across web + Android + iOS, in deterministic emit order.
// iOS transpiles everything in shaders/; these are the ones that also get
// code-generated into the Android Kotlin and web TS layers.
const SHARED_CODEGEN = ['passthrough.vert', 'composite.frag'] as const;

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

// passthrough.vert -> PASSTHROUGH_VERT, composite.frag -> COMPOSITE_FRAG.
function constBase(filename: string): string {
  const { name, ext } = parse(filename);
  const stage = ext === '.vert' ? 'VERT' : 'FRAG';
  return `${name.toUpperCase()}_${stage}`;
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
  const consts = SHARED_CODEGEN.map((file) => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Kotlin raw-string escape for '$', not a JS placeholder
    const body = (sources.get(file) as string).replace(/\$/g, "${'$'}");
    return `  const val ${constBase(file)} = """${body}"""`;
  }).join('\n\n');

  const out = `// @generated by scripts/build-shaders.ts from shaders/. DO NOT EDIT.
// Run \`bun run build:shaders\` to regenerate.
//
// Cross-runtime shared shaders. Platform-local shaders (OES external texture,
// 2D passthrough) stay hand-written in Shaders.kt, which delegates the consts
// below.

package com.simiancraft.kaleidoscope.gpu

internal object ShadersGenerated {
${consts}
}
`;
  writeFileSync(ANDROID_OUT, out);
  console.log(`  gen:  Android  ->  ${ANDROID_OUT.replace(REPO_ROOT, '.')}`);
}

// TS template literals interpret backtick, backslash, and `${`; GLSL uses none,
// but escape defensively so a future shader can't break codegen.
function emitWeb(sources: Map<string, string>): void {
  const consts = SHARED_CODEGEN.map((file) => {
    const body = (sources.get(file) as string)
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
    return `export const ${constBase(file)}_SRC = \`${body}\`;`;
  }).join('\n\n');

  const out = `// @generated by scripts/build-shaders.ts from shaders/. DO NOT EDIT.
// Run \`bun run build:shaders\` to regenerate.

${consts}
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

  const files = readdirSync(GLSL_DIR).filter((f) => f.endsWith('.frag') || f.endsWith('.vert'));
  if (files.length === 0) {
    console.error(`No .frag or .vert files found under ${GLSL_DIR}`);
    process.exit(2);
  }

  // 1. iOS: transpile every shader to MSL.
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

  // 2. Android + web: code-generate the shared set.
  const sources = new Map<string, string>();
  for (const file of SHARED_CODEGEN) {
    const path = join(GLSL_DIR, file);
    if (!existsSync(path)) {
      console.error(`SHARED_CODEGEN lists ${file} but ${path} does not exist`);
      process.exit(2);
    }
    sources.set(file, stripToVersion(readFileSync(path, 'utf8')));
  }
  emitAndroid(sources);
  emitWeb(sources);

  // 3. Stamp the iOS bundle with the shader list (PR-diff aid).
  writeFileSync(join(METAL_OUT_DIR, 'SHADERS.txt'), `${files.sort().join('\n')}\n`);

  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('Done.');
}

main();
