#!/usr/bin/env bun
// Shader cost comparator. Diffs the SPIR-V instruction cost of two GLSL shaders
// (A = baseline, B = candidate) through the SAME glslangValidator -> spirv-opt -O
// pipeline build:shaders ships, so the ops it counts are the ops that ship.
//
// Use it to mechanically decide whether a hand optimization is actually cheaper
// BEFORE eyeballing visual parity in ShaderToy: if the op count drops and you
// cannot see degradation, the win is free.
//
//   bun run scripts/shader-cost.ts <baseline> <candidate>
//   bun run scripts/shader-cost.ts <shader>          # vs git HEAD:<shader>
//   bun run bench:shader <baseline> <candidate>      # package.json alias
//
// Inputs may be EITHER form:
//   - the repo's compilable shader (#version + void main; e.g.
//     catalog/shaders/clouds/clouds.frag), measured as-is, or
//   - a ShaderToy Image snippet (a `mainImage(out vec4, in vec2)` body; e.g. a
//     *.shadertoy.glsl), auto-wrapped with iTime/iResolution/iMouse so the
//     literal thing you paste into ShaderToy is exactly what gets measured.
//
// CAVEAT (printed in the output too): this is a STATIC count. Loop bodies are
// counted once and dynamic early-outs (break / discard / return) are NOT
// modeled, so it UNDER-credits early-out wins (raymarch breaks, mote culls) and
// is most accurate for straight-line ALU changes (hoisting, pow->mul, CSE,
// dedup). It answers "cheaper or not", never "how many ms". Visual parity is
// your call in ShaderToy; this is the other half.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { $ } from 'bun';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Match build-shaders.ts: emitted output must start at the literal #version
// token, and GLSL ES -> SPIR-V needs >= 3.10 (a strict superset of 3.00 here).
function stripToVersion(raw: string): string {
  return raw.replace(/^[\s\S]*?(#version)/, '$1');
}

export type Stage = 'frag' | 'vert';

// Normalize either input form to a compilable GLSL ES 3.10 fragment/vertex unit.
function prepareSource(raw: string, label: string): string {
  const hasVersion = /#version/.test(raw);
  const hasMain = /\bvoid\s+main\s*\(/.test(raw);
  if (hasVersion && hasMain) {
    return stripToVersion(raw).replace('#version 300 es', '#version 310 es');
  }
  if (/\bmainImage\s*\(/.test(raw)) {
    // ShaderToy Image form: provide the builtins ShaderToy injects, then call it.
    return [
      '#version 310 es',
      'precision highp float;',
      'uniform vec3 iResolution;',
      'uniform float iTime;',
      'uniform vec4 iMouse;',
      'uniform int iFrame;',
      'out vec4 _shaderCostFragColor;',
      raw,
      'void main() { mainImage(_shaderCostFragColor, gl_FragCoord.xy); }',
      '',
    ].join('\n');
  }
  throw new Error(
    `${label}: unrecognized shader form (need '#version' + 'void main', or a 'mainImage(...)' ShaderToy body).`,
  );
}

// glslangValidator -> spirv-opt -O, returning the optimized .spv path. Flags
// mirror build-shaders.ts exactly so the measured binary is the shipped binary.
async function compileOptimized(
  glsl: string,
  stage: Stage,
  dir: string,
  tag: string,
): Promise<string> {
  const inPath = join(dir, `${tag}.${stage}`);
  const spv = join(dir, `${tag}.spv`);
  const opt = join(dir, `${tag}.opt.spv`);
  writeFileSync(inPath, glsl);
  const gv =
    await $`glslangValidator -G --auto-map-bindings --auto-map-locations -S ${stage} ${inPath} -o ${spv}`
      .quiet()
      .nothrow();
  if (gv.exitCode !== 0) {
    throw new Error(`glslang failed for ${tag}:\n${gv.stdout.toString()}${gv.stderr.toString()}`);
  }
  const so = await $`spirv-opt -O ${spv} -o ${opt}`.quiet().nothrow();
  if (so.exitCode !== 0) {
    throw new Error(`spirv-opt failed for ${tag}:\n${so.stdout.toString()}${so.stderr.toString()}`);
  }
  return opt;
}

// --- instruction taxonomy --------------------------------------------------

// GLSL.std.450 extended instructions whose hardware cost is several cycles (the
// ones worth hunting). Pow/Exp/Log/Sqrt/trig + the sqrt-backed vector ops.
const EXPENSIVE_EXT = new Set([
  'Sin',
  'Cos',
  'Tan',
  'Asin',
  'Acos',
  'Atan',
  'Atan2',
  'Sinh',
  'Cosh',
  'Tanh',
  'Asinh',
  'Acosh',
  'Atanh',
  'Pow',
  'Exp',
  'Exp2',
  'Log',
  'Log2',
  'Sqrt',
  'InverseSqrt',
  'Length',
  'Distance',
  'Normalize',
]);
// Cheap GLSL.std.450 builtins: single-cycle-ish.
const CHEAP_EXT = new Set([
  'FAbs',
  'SAbs',
  'FSign',
  'SSign',
  'Floor',
  'Ceil',
  'Fract',
  'Trunc',
  'Round',
  'RoundEven',
  'FMin',
  'FMax',
  'SMin',
  'SMax',
  'UMin',
  'UMax',
  'FClamp',
  'SClamp',
  'UClamp',
  'FMix',
  'Step',
  'SmoothStep',
  'Fma',
  'Cross',
  'Reflect',
  'Refract',
  'Radians',
  'Degrees',
  'Ldexp',
  'NMin',
  'NMax',
  'NClamp',
]);
// Expensive fixed-opcode ops (division is multi-cycle; group it with the math).
const EXPENSIVE_OP = new Set([
  'OpFDiv',
  'OpSDiv',
  'OpUDiv',
  'OpSRem',
  'OpSMod',
  'OpUMod',
  'OpFMod',
  'OpFRem',
]);
const ARITH_OP = new Set([
  'OpFAdd',
  'OpFSub',
  'OpFMul',
  'OpFNegate',
  'OpDot',
  'OpIAdd',
  'OpISub',
  'OpIMul',
  'OpVectorTimesScalar',
  'OpMatrixTimesScalar',
  'OpMatrixTimesVector',
  'OpVectorTimesMatrix',
  'OpMatrixTimesMatrix',
  'OpOuterProduct',
  'OpShiftLeftLogical',
  'OpShiftRightLogical',
  'OpShiftRightArithmetic',
  'OpBitwiseOr',
  'OpBitwiseXor',
  'OpBitwiseAnd',
]);
const MEMORY_OP = new Set([
  'OpLoad',
  'OpStore',
  'OpAccessChain',
  'OpInBoundsAccessChain',
  'OpCompositeExtract',
  'OpCompositeInsert',
  'OpCompositeConstruct',
  'OpVectorShuffle',
  'OpVectorExtractDynamic',
  'OpVectorInsertDynamic',
  'OpCopyObject',
  'OpTranspose',
]);
const CONTROL_OP = new Set([
  'OpBranch',
  'OpBranchConditional',
  'OpLoopMerge',
  'OpSelectionMerge',
  'OpSwitch',
  'OpReturn',
  'OpReturnValue',
  'OpKill',
  'OpTerminateInvocation',
  'OpDemoteToHelperInvocation',
  'OpPhi',
  'OpFunctionCall',
]);
const COMPARE_OP = new Set([
  'OpFOrdEqual',
  'OpFOrdNotEqual',
  'OpFOrdLessThan',
  'OpFOrdLessThanEqual',
  'OpFOrdGreaterThan',
  'OpFOrdGreaterThanEqual',
  'OpFUnordLessThan',
  'OpFUnordGreaterThan',
  'OpFUnordLessThanEqual',
  'OpFUnordGreaterThanEqual',
  'OpIEqual',
  'OpINotEqual',
  'OpSLessThan',
  'OpSGreaterThan',
  'OpSLessThanEqual',
  'OpSGreaterThanEqual',
  'OpULessThan',
  'OpUGreaterThan',
  'OpLogicalAnd',
  'OpLogicalOr',
  'OpLogicalNot',
  'OpLogicalEqual',
  'OpSelect',
  'OpAll',
  'OpAny',
  'OpIsNan',
  'OpIsInf',
]);
const CONVERT_OP = new Set([
  'OpConvertFToS',
  'OpConvertFToU',
  'OpConvertSToF',
  'OpConvertUToF',
  'OpFConvert',
  'OpSConvert',
  'OpUConvert',
  'OpBitcast',
]);
// Non-runtime: module headers, types, constants, decorations, debug, scaffolding.
const SKIP_PREFIX = ['OpType', 'OpConstant', 'OpSpecConstant'];
const SKIP_OP = new Set([
  'OpCapability',
  'OpExtension',
  'OpExtInstImport',
  'OpMemoryModel',
  'OpEntryPoint',
  'OpExecutionMode',
  'OpExecutionModeId',
  'OpSource',
  'OpSourceExtension',
  'OpSourceContinued',
  'OpName',
  'OpMemberName',
  'OpModuleProcessed',
  'OpDecorate',
  'OpMemberDecorate',
  'OpDecorationGroup',
  'OpGroupDecorate',
  'OpLine',
  'OpNoLine',
  'OpVariable',
  'OpFunction',
  'OpFunctionParameter',
  'OpFunctionEnd',
  'OpLabel',
  'OpUndef',
  'OpString',
]);

const BUCKETS = [
  'expensive math',
  'arithmetic',
  'memory/move',
  'control flow',
  'compare/logic',
  'convert',
  'texture',
  'other',
] as const;
type Bucket = (typeof BUCKETS)[number];

type Tally = {
  buckets: Record<Bucket, number>;
  total: number;
  weighted: number;
  expensiveHist: Map<string, number>;
};

function emptyTally(): Tally {
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  return { buckets, total: 0, weighted: 0, expensiveHist: new Map() };
}

// Rough hardware cost weights so the headline reflects reality rather than
// treating a transcendental and an add as equal. Not cycle-accurate (that is
// malioc's job); enough to stop raw op-count from hiding a pow->mul win.
function weightOf(bucket: Bucket, key: string): number {
  if (bucket === 'expensive math') {
    // A non-integer pow lowers to log2 + exp2 on mobile GPUs: two transcendentals,
    // not one. Weighting it like sin/sqrt under-credits pow->mul strength reductions.
    if (key === 'Pow') return 16;
    return /Div|Mod|Rem/.test(key) ? 4 : 8;
  }
  if (bucket === 'texture') return 4;
  return 1;
}

function classify(op: string, extName: string | null): { bucket: Bucket; key: string } | null {
  if (SKIP_OP.has(op)) return null;
  if (SKIP_PREFIX.some((p) => op.startsWith(p))) return null;
  if (op === 'OpExtInst' && extName) {
    if (EXPENSIVE_EXT.has(extName)) return { bucket: 'expensive math', key: extName };
    if (CHEAP_EXT.has(extName)) return { bucket: 'arithmetic', key: extName };
    return { bucket: 'other', key: extName };
  }
  if (EXPENSIVE_OP.has(op)) return { bucket: 'expensive math', key: op.replace(/^Op/, '') };
  if (ARITH_OP.has(op)) return { bucket: 'arithmetic', key: op };
  if (MEMORY_OP.has(op)) return { bucket: 'memory/move', key: op };
  if (CONTROL_OP.has(op)) return { bucket: 'control flow', key: op };
  if (COMPARE_OP.has(op)) return { bucket: 'compare/logic', key: op };
  if (CONVERT_OP.has(op)) return { bucket: 'convert', key: op };
  if (op.startsWith('OpImage')) return { bucket: 'texture', key: op };
  return { bucket: 'other', key: op };
}

async function tally(optSpv: string): Promise<Tally> {
  const dis = await $`spirv-dis --no-color ${optSpv}`.quiet().text();
  const t = emptyTally();
  for (const line of dis.split('\n')) {
    const opMatch = line.match(/\bOp[A-Z]\w*/);
    if (!opMatch) continue;
    const op = opMatch[0];
    let extName: string | null = null;
    if (op === 'OpExtInst') {
      const m = line.match(/OpExtInst\s+%\w+\s+%\w+\s+(\w+)/);
      extName = m ? m[1] : null;
    }
    const c = classify(op, extName);
    if (!c) continue;
    t.buckets[c.bucket] += 1;
    t.total += 1;
    t.weighted += weightOf(c.bucket, c.key);
    if (c.bucket === 'expensive math')
      t.expensiveHist.set(c.key, (t.expensiveHist.get(c.key) ?? 0) + 1);
  }
  return t;
}

export type ShaderCost = { total: number; weighted: number; expensive: number };

// Compile GLSL (300 or 310 es) through the build:shaders pipeline and return the
// weighted op cost. Reused by scripts/shader-view.ts to show a static, ms-free
// number alongside the GPU-time meter.
export async function shaderCost(glsl: string, stage: Stage): Promise<ShaderCost> {
  const prepared = glsl.replace('#version 300 es', '#version 310 es');
  const dir = mkdtempSync(join(tmpdir(), 'shader-cost-'));
  try {
    const opt = await compileOptimized(prepared, stage, dir, 'x');
    const t = await tally(opt);
    return { total: t.total, weighted: t.weighted, expensive: t.buckets['expensive math'] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- input resolution ------------------------------------------------------

function stageOf(path: string): Stage {
  return path.endsWith('.vert') ? 'vert' : 'frag';
}

async function gitHeadVersion(path: string): Promise<string> {
  const rel = relative(REPO_ROOT, resolve(process.cwd(), path));
  const r = await $`git -C ${REPO_ROOT} show HEAD:${rel}`.quiet().nothrow();
  if (r.exitCode !== 0) {
    throw new Error(
      `no committed version of ${rel} at HEAD (untracked or never committed). Pass an explicit baseline as the first argument instead.`,
    );
  }
  return r.stdout.toString();
}

// --- formatting ------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
function rpad(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function report(aLabel: string, bLabel: string, a: Tally, b: Tally): void {
  console.log('');
  console.log('shader cost — SPIR-V runtime ops after `spirv-opt -O` (the build:shaders pipeline)');
  console.log('');
  console.log(`  A  ${aLabel}`);
  console.log(`  B  ${bLabel}`);
  console.log('');
  console.log(`  ${pad('category', 16)}${rpad('A', 7)}${rpad('B', 7)}${rpad('Δ', 8)}`);
  console.log(`  ${'─'.repeat(37)}`);
  for (const bucket of BUCKETS) {
    const av = a.buckets[bucket];
    const bv = b.buckets[bucket];
    if (av === 0 && bv === 0) continue;
    const d = bv - av;
    console.log(
      `  ${pad(bucket, 16)}${rpad(String(av), 7)}${rpad(String(bv), 7)}${rpad(d === 0 ? '·' : signed(d), 8)}`,
    );
  }
  console.log(`  ${'─'.repeat(37)}`);
  const dTotal = b.total - a.total;
  console.log(
    `  ${pad('total runtime', 16)}${rpad(String(a.total), 7)}${rpad(String(b.total), 7)}${rpad(dTotal === 0 ? '·' : signed(dTotal), 8)}`,
  );
  const dWeighted = b.weighted - a.weighted;
  console.log(
    `  ${pad('weighted cost', 16)}${rpad(String(a.weighted), 7)}${rpad(String(b.weighted), 7)}${rpad(dWeighted === 0 ? '·' : signed(dWeighted), 8)}`,
  );
  console.log('');

  // Expensive-math histogram (the actionable column): union of keys, A vs B.
  const keys = Array.from(new Set([...a.expensiveHist.keys(), ...b.expensiveHist.keys()])).sort();
  if (keys.length > 0) {
    console.log('  expensive-math breakdown (sin/cos/pow/exp/log/sqrt/div):');
    for (const k of keys) {
      const av = a.expensiveHist.get(k) ?? 0;
      const bv = b.expensiveHist.get(k) ?? 0;
      const d = bv - av;
      console.log(
        `    ${pad(k, 14)}${rpad(String(av), 6)}${rpad(String(bv), 6)}${rpad(d === 0 ? '·' : signed(d), 7)}`,
      );
    }
    console.log('');
  }

  // Verdict — keyed on WEIGHTED cost (a pow is ~8x an add), since raw op-count
  // can call a real transcendental win "identical".
  const wpct = a.weighted === 0 ? 0 : (dWeighted / a.weighted) * 100;
  const dExp = b.buckets['expensive math'] - a.buckets['expensive math'];
  const expNote =
    dExp === 0 ? '' : `, ${signed(dExp)} expensive-math op${Math.abs(dExp) === 1 ? '' : 's'}`;
  if (dWeighted < 0) {
    console.log(
      `  → B is cheaper: weighted ${signed(dWeighted)} (${wpct.toFixed(1)}%), raw ${signed(dTotal)} ops${expNote}.`,
    );
  } else if (dWeighted > 0) {
    console.log(
      `  → B is MORE expensive: weighted +${dWeighted} (+${wpct.toFixed(1)}%), raw ${signed(dTotal)} ops${expNote}.`,
    );
  } else {
    console.log(`  → weighted cost identical (raw ${signed(dTotal)} ops${expNote}).`);
  }
  console.log('');
  console.log('  NOTE: static count. Loop bodies counted once; dynamic early-outs');
  console.log('  (break/discard/return) are not modeled, so early-out wins read low.');
  console.log('  Most accurate for straight-line ALU changes. Confirm visual parity');
  console.log('  in ShaderToy: if it looks the same and this dropped, the win is free.');
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (args.length < 1 || args.length > 2) {
    console.error('usage: bun run scripts/shader-cost.ts <baseline> <candidate>');
    console.error('       bun run scripts/shader-cost.ts <shader>   # vs git HEAD:<shader>');
    process.exit(2);
  }

  let aRaw: string;
  let aLabel: string;
  let bRaw: string;
  let bLabel: string;
  let stage: Stage;

  if (args.length === 2) {
    const [aPath, bPath] = args;
    aRaw = readFileSync(aPath, 'utf8');
    bRaw = readFileSync(bPath, 'utf8');
    aLabel = aPath;
    bLabel = bPath;
    stage = stageOf(bPath);
  } else {
    const [path] = args;
    bRaw = readFileSync(path, 'utf8');
    aRaw = await gitHeadVersion(path);
    aLabel = `HEAD:${relative(REPO_ROOT, resolve(process.cwd(), path))}`;
    bLabel = `${path} (working tree)`;
    stage = stageOf(path);
  }

  const dir = mkdtempSync(join(tmpdir(), 'shader-cost-'));
  try {
    const aOpt = await compileOptimized(prepareSource(aRaw, aLabel), stage, dir, 'a');
    const bOpt = await compileOptimized(prepareSource(bRaw, bLabel), stage, dir, 'b');
    const [aTally, bTally] = await Promise.all([tally(aOpt), tally(bOpt)]);
    report(aLabel, bLabel, aTally, bTally);
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
