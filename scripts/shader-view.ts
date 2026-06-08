#!/usr/bin/env bun
// Side-by-side shader viewer with a GPU-time meter. Renders two shaders at once
// in WebGL2 so you can eyeball visual parity (the half only your eyes can do)
// while a meter shows the cost difference (the half the machine does). Replaces
// "paste into ShaderToy" for the visual check, and unlike ShaderToy it reads the
// repo's real .frag + its .ts uniform defaults directly, so there is no const-
// baked duplicate to maintain and no benchmarking confound.
//
//   bun run scripts/shader-view.ts <A> <B>      # two shaders
//   bun run scripts/shader-view.ts <shader>     # working tree vs git HEAD
//   bun run shader:view <A> <B>                 # package.json alias
//
// ===========================================================================
// CONVENTIONS (for humans and LLMs setting up a comparison)
// ===========================================================================
// A shader is a folder catalog/shaders/<name>/ holding:
//   <name>.frag  GLSL ES 3.00 source (#version 300 es; precision highp float;
//                in highp vec2 vUv; out vec4 oColor; void main()). Engine
//                uniforms are uTime (float seconds) and, if used, uResolution
//                (vec2 pixels). Every other uniform is a tunable.
//   <name>.ts    exports `<NAME>_CONTROLS: readonly UniformControl[]` — one
//                entry per tunable uniform: { name, kind:'color'|'float',
//                default, (min,max,step for float), doc }. This file is the
//                single source of a uniform's default + range; the viewer reads
//                it to seed and to build the live sliders below.
//
// To A/B an optimization (the intended loop), do NOT make a const-baked
// ShaderToy copy — that folds the uniforms away and skews the benchmark.
// Instead:
//   1. Edit <name>.frag IN PLACE (keep the uniforms; only change the body).
//   2. bun run shader:view  catalog/shaders/<name>/<name>.frag   # vs git HEAD:
//      visual parity + GPU-time meter, both sides same uniform values.
//   3. bun run bench:shader  catalog/shaders/<name>/<name>.frag   # static op
//      cost (weighted). Use bench for straight-line ALU wins; use the viewer's
//      meter for dynamic early-outs (loop breaks) that static counting misses.
//   4. Output-identical change + meter/bench says cheaper => free win. Ship the
//      .frag edit (bun run build:shaders regenerates web/Android/iOS).
// For two distinct variants instead of vs-HEAD, pass two explicit paths; name
// the baseline first (A) and the candidate second (B).
//
// A ShaderToy `mainImage(out vec4, in vec2)` snippet is also accepted (rendered
// as-is, no .ts), for porting an external prototype in — but the repo form
// above is the one that benchmarks honestly.
//
// THE METER: draw-call COUNT is 1 per shader and never differs, so the honest
// number is GPU TIME per render. It times K overdraws at a chosen resolution and
// syncs with readPixels. Absolute ms is THIS GPU (a desktop, not a phone); the
// A/B RATIO is the transferable signal. Crank the resolution / overdraw sliders
// until the slower side dips below your refresh to make the shader the
// bottleneck (a strong GPU pins both at vsync otherwise).

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { $ } from 'bun';
import { type ShaderCost, shaderCost } from './shader-cost';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function stripToVersion(raw: string): string {
  return raw.replace(/^[\s\S]*?(#version)/, '$1');
}

// Fullscreen triangle from gl_VertexID; no vertex buffer needed. vUv spans 0..1
// over the visible area (bottom-left origin, matching passthrough.vert).
const FULLSCREEN_VERT = `#version 300 es
out highp vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

type GlType = 'float' | 'int' | 'vec2' | 'vec3' | 'vec4';
type UniformRole = 'time' | 'res2' | 'res3' | 'static';
type UniformSpec = { name: string; role: UniformRole; glType: GlType; value?: number | number[] };
type ControlMeta = {
  name: string;
  label?: string;
  kind: 'color' | 'float';
  default: number | number[];
  min?: number;
  max?: number;
  step?: number;
};
type Side = {
  label: string;
  fragSrc: string;
  uniforms: UniformSpec[];
  controls: ControlMeta[];
  notes: string[];
};

function defaultForType(t: GlType): number | number[] {
  if (t === 'float' || t === 'int') return 1;
  if (t === 'vec2') return [0, 0];
  if (t === 'vec4') return [1, 1, 1, 1];
  return [1, 1, 1];
}

// Find a *_CONTROLS-style array in a sibling .ts module (entries carry name +
// kind + default), and return it verbatim for both defaults and slider metadata.
function controlList(mod: Record<string, unknown>): ControlMeta[] {
  for (const v of Object.values(mod)) {
    if (
      Array.isArray(v) &&
      v.length > 0 &&
      typeof v[0] === 'object' &&
      v[0] !== null &&
      'name' in v[0] &&
      'default' in v[0] &&
      'kind' in v[0]
    ) {
      return v as ControlMeta[];
    }
  }
  return [];
}

async function resolveSide(raw: string, path: string, label: string): Promise<Side> {
  const isFrag = /#version/.test(raw) && /\bvoid\s+main\s*\(/.test(raw);
  const isShadertoy = !isFrag && /\bmainImage\s*\(/.test(raw);

  if (isShadertoy) {
    const fragSrc = [
      '#version 300 es',
      'precision highp float;',
      'uniform vec3 iResolution;',
      'uniform float iTime;',
      'uniform vec4 iMouse;',
      'out vec4 _frag;',
      raw,
      'void main() { mainImage(_frag, gl_FragCoord.xy); }',
      '',
    ].join('\n');
    return {
      label,
      fragSrc,
      uniforms: [
        { name: 'iTime', role: 'time', glType: 'float' },
        { name: 'iResolution', role: 'res3', glType: 'vec3' },
        { name: 'iMouse', role: 'static', glType: 'vec4', value: [0, 0, 0, 0] },
      ],
      controls: [],
      notes: [],
    };
  }

  if (isFrag) {
    const fragSrc = stripToVersion(raw);
    const notes: string[] = [];
    let controls: ControlMeta[] = [];
    if (path.endsWith('.frag')) {
      const tsPath = join(dirname(resolve(process.cwd(), path)), `${basename(path, '.frag')}.ts`);
      try {
        controls = controlList((await import(tsPath)) as Record<string, unknown>);
      } catch {
        notes.push('no sibling .ts found; tunable uniforms defaulted');
      }
    }
    const defaults = new Map(controls.map((c) => [c.name, c.default]));
    const uniforms: UniformSpec[] = [];
    const re = /uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)\s*;/g;
    let m: RegExpExecArray | null = re.exec(fragSrc);
    while (m !== null) {
      const glType = m[1] as GlType;
      const name = m[2];
      if (name === 'uTime' || name === 'iTime') {
        uniforms.push({ name, role: 'time', glType: 'float' });
      } else if (name === 'uResolution' || name === 'iResolution') {
        uniforms.push({ name, role: glType === 'vec3' ? 'res3' : 'res2', glType });
      } else if (defaults.has(name)) {
        uniforms.push({ name, role: 'static', glType, value: defaults.get(name) });
      } else {
        notes.push(`${name} not in .ts; defaulted`);
        uniforms.push({ name, role: 'static', glType, value: defaultForType(glType) });
      }
      m = re.exec(fragSrc);
    }
    return { label, fragSrc, uniforms, controls, notes };
  }

  throw new Error(
    `${label}: unrecognized shader form (need '#version'+'void main' or 'mainImage(...)').`,
  );
}

async function gitHeadVersion(path: string): Promise<string> {
  const rel = relative(REPO_ROOT, resolve(process.cwd(), path));
  const r = await $`git -C ${REPO_ROOT} show HEAD:${rel}`.quiet().nothrow();
  if (r.exitCode !== 0) {
    throw new Error(
      `no committed version of ${rel} at HEAD. Pass an explicit baseline as the first argument.`,
    );
  }
  return r.stdout.toString();
}

function html(
  sides: [Side, Side],
  vert: string,
  costs: [ShaderCost | null, ShaderCost | null],
): string {
  // Union the two sides' controls by name (first wins) into one shared panel,
  // so the same uniform values drive both renders and the A/B stays fair.
  const byName = new Map<string, ControlMeta>();
  for (const side of sides)
    for (const c of side.controls) if (!byName.has(c.name)) byName.set(c.name, c);
  const controls = [...byName.values()];
  const data = JSON.stringify({ vert, sides, controls, costs });
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>shader A/B</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0c0d10; color: #d7dae0; font: 13px/1.4 ui-monospace, monospace; }
  header { padding: 8px 12px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #23262d; }
  header .ctl { display: flex; gap: 6px; align-items: center; }
  details.uni { border-bottom: 1px solid #23262d; }
  details.uni > summary { padding: 6px 12px; cursor: pointer; color: #9aa0aa; user-select: none; }
  .upanel { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 4px 12px 10px; }
  .uctl { display: flex; gap: 6px; align-items: center; }
  .uctl label { color: #9aa0aa; min-width: 0; }
  .uctl .uval { color: #8b909a; width: 48px; text-align: right; }
  .stage { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #23262d; }
  .pane { background: #0c0d10; padding: 8px; }
  canvas { width: 100%; aspect-ratio: 16 / 9; display: block; background: #000; border-radius: 4px; }
  .label { color: #9aa0aa; margin: 6px 2px 2px; word-break: break-all; }
  .ms { font-size: 22px; color: #eaecef; }
  .ms small { font-size: 12px; color: #8b909a; }
  .sc { color: #8b909a; font-size: 12px; margin-top: 2px; }
  .verdict { text-align: center; padding: 6px 6px 0; font-size: 14px; color: #cfd3da; }
  .sverdict { text-align: center; padding: 2px 6px 6px; font-size: 12px; color: #9aa0aa; }
  .err { color: #ff7b72; white-space: pre-wrap; font-size: 11px; }
  .note { color: #b58900; font-size: 11px; }
  footer { padding: 8px 12px; color: #6f757f; font-size: 11px; border-top: 1px solid #23262d; }
  input[type=range] { width: 110px; }
  button { background: #1b1e25; color: #d7dae0; border: 1px solid #2c313a; border-radius: 4px; padding: 3px 9px; cursor: pointer; }
</style></head>
<body>
<header>
  <strong>shader A/B</strong>
  <div class="ctl"><button id="pause">pause</button></div>
  <div class="ctl">speed <input type="range" id="speed" min="0" max="3" step="0.05" value="1"><span id="speedv">1.0×</span></div>
  <div class="ctl">meter res <input type="range" id="mres" min="256" max="4096" step="128" value="1280"><span id="mresv">1280</span></div>
  <div class="ctl">overdraw <input type="range" id="mk" min="1" max="200" step="1" value="24"><span id="mkv">24</span>×</div>
  <div class="ctl" id="gpu" style="color:#6f757f"></div>
</header>
<details class="uni" open><summary id="usum">shader uniforms (shared A/B)</summary><div class="upanel" id="uniforms"></div></details>
<div class="verdict" id="verdict">measuring…</div>
<div class="sverdict" id="sverdict"></div>
<div class="stage">
  <div class="pane"><canvas id="ca"></canvas><div class="label" id="la"></div><div class="ms" id="ma">—</div><div class="sc" id="sca"></div><div class="note" id="na"></div><div class="err" id="ea"></div></div>
  <div class="pane"><canvas id="cb"></canvas><div class="label" id="lb"></div><div class="ms" id="mb">—</div><div class="sc" id="scb"></div><div class="note" id="nb"></div><div class="err" id="eb"></div></div>
</div>
<footer id="foot"></footer>
<script>
const DATA = ${data};
const VERT = DATA.vert;
// Shared live uniform values, seeded from the .ts control defaults; sliders mutate this.
const VALUES = {};
for (const c of DATA.controls) VALUES[c.name] = Array.isArray(c.default) ? c.default.slice() : c.default;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
function toHex(v){ const h=(x)=>('0'+Math.round(clamp01(x)*255).toString(16)).slice(-2); return '#'+h(v[0])+h(v[1])+h(v[2]); }
function fromHex(s){ return [parseInt(s.slice(1,3),16)/255, parseInt(s.slice(3,5),16)/255, parseInt(s.slice(5,7),16)/255]; }

function buildUniformPanel() {
  const panel = document.getElementById('uniforms');
  if (DATA.controls.length === 0) { document.querySelector('details.uni').open = false; document.getElementById('usum').textContent = 'shader uniforms (none — ShaderToy snippet)'; return; }
  document.getElementById('usum').textContent = 'shader uniforms (shared A/B) — ' + DATA.controls.length;
  for (const c of DATA.controls) {
    const wrap = document.createElement('div'); wrap.className = 'uctl';
    const lab = document.createElement('label'); lab.textContent = c.label || c.name; lab.title = c.doc || '';
    wrap.appendChild(lab);
    if (c.kind === 'color') {
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = toHex(VALUES[c.name]);
      inp.oninput = () => { VALUES[c.name] = fromHex(inp.value); };
      wrap.appendChild(inp);
    } else {
      const inp = document.createElement('input'); inp.type = 'range';
      inp.min = c.min ?? 0; inp.max = c.max ?? 1; inp.step = c.step ?? 0.01; inp.value = VALUES[c.name];
      const out = document.createElement('span'); out.className = 'uval'; out.textContent = (+VALUES[c.name]).toFixed(3);
      inp.oninput = () => { VALUES[c.name] = +inp.value; out.textContent = (+inp.value).toFixed(3); };
      wrap.appendChild(inp); wrap.appendChild(out);
    }
    panel.appendChild(wrap);
  }
}

function compile(gl, type, src, panel) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    if (panel) panel.textContent = log || 'compile error';
    throw new Error(log || 'compile error');
  }
  return s;
}
function makeProgram(gl, fs, panel) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT, panel));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, panel));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    if (panel) panel.textContent = log || 'link error';
    throw new Error(log || 'link error');
  }
  return p;
}
function makeFbo(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}
function setUniforms(gl, locs, uniforms, time, W, H) {
  for (const u of uniforms) {
    const loc = locs[u.name];
    if (!loc) continue;
    if (u.role === 'time') gl.uniform1f(loc, time);
    else if (u.role === 'res2') gl.uniform2f(loc, W, H);
    else if (u.role === 'res3') gl.uniform3f(loc, W, H, 1);
    else {
      const v = (u.name in VALUES) ? VALUES[u.name] : u.value;  // live slider value, else baked
      if (u.glType === 'float' || u.glType === 'int') gl.uniform1f(loc, Array.isArray(v) ? v[0] : v);
      else if (u.glType === 'vec2') gl.uniform2f(loc, v[0], v[1]);
      else if (u.glType === 'vec4') gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
      else gl.uniform3f(loc, v[0], v[1], v[2]);
    }
  }
}
function makeSide(canvas, side, errPanel) {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
  if (!gl) { errPanel.textContent = 'WebGL2 unavailable'; return null; }
  let prog;
  try { prog = makeProgram(gl, side.fragSrc, errPanel); } catch { return null; }
  const locs = {};
  for (const u of side.uniforms) locs[u.name] = gl.getUniformLocation(prog, u.name);
  const scratch = new Uint8Array(4);
  let meter = makeFbo(gl, 1280, Math.round(1280 * 9 / 16));
  return {
    gl, prog, locs, scratch, meter,
    resizeMeter(res) {
      const w = res, h = Math.max(1, Math.round(res * 9 / 16));
      if (w !== meter.w || h !== meter.h) { gl.deleteFramebuffer(meter.fbo); gl.deleteTexture(meter.tex); meter = makeFbo(gl, w, h); this.meter = meter; }
    },
    draw(time) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      setUniforms(gl, locs, side.uniforms, time, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    measure(time, k) {
      const m = this.meter;
      gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
      gl.viewport(0, 0, m.w, m.h);
      gl.useProgram(prog);
      setUniforms(gl, locs, side.uniforms, time, m.w, m.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);            // warm
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
      const t0 = performance.now();
      for (let i = 0; i < k; i++) gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, scratch); // sync
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return (performance.now() - t0) / k;
    },
  };
}
buildUniformPanel();
const ca = document.getElementById('ca'), cb = document.getElementById('cb');
document.getElementById('la').textContent = 'A · ' + DATA.sides[0].label;
document.getElementById('lb').textContent = 'B · ' + DATA.sides[1].label;
document.getElementById('na').textContent = DATA.sides[0].notes.join('; ');
document.getElementById('nb').textContent = DATA.sides[1].notes.join('; ');
const A = makeSide(ca, DATA.sides[0], document.getElementById('ea'));
const B = makeSide(cb, DATA.sides[1], document.getElementById('eb'));
try {
  const gl = (A || B).gl, ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) document.getElementById('gpu').textContent = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
} catch {}
document.getElementById('foot').textContent =
  'Meter = GPU time per render: K overdraws at meter-res, readPixels-synced. Draw-call count is 1; GPU time is what differs. ' +
  'Absolute ms is THIS GPU, not a phone — the A/B ratio is the transferable signal. Crank meter-res / overdraw until the slower side drops below your refresh. ' +
  'Static op cost (below each render) is GPU-independent: a deterministic count of SPIR-V ops after spirv-opt -O, weighted (transcendentals ~8x). It does not move with the sliders or your GPU.';
// Static op cost: deterministic, GPU-independent "how much better" number.
const COSTS = DATA.costs;
function sgn(n) { return n > 0 ? '+' + n : '' + n; }
(function showStatic() {
  const setSC = (id, c) => { document.getElementById(id).textContent = c ? ('static cost: ' + c.weighted + ' wt ops · ' + c.expensive + ' transcendental') : 'static cost: n/a'; };
  setSC('sca', COSTS[0]); setSC('scb', COSTS[1]);
  const sv = document.getElementById('sverdict');
  if (COSTS[0] && COSTS[1]) {
    const dw = COSTS[1].weighted - COSTS[0].weighted;
    const de = COSTS[1].expensive - COSTS[0].expensive;
    const pct = COSTS[0].weighted ? (dw / COSTS[0].weighted * 100) : 0;
    if (dw === 0 && de === 0) sv.textContent = 'static op cost: identical (no straight-line ALU change)';
    else sv.textContent = 'static op cost (GPU-independent): B ' + sgn(dw) + ' weighted ops (' + pct.toFixed(1) + '%), ' + sgn(de) + ' transcendental';
  } else sv.textContent = 'static op cost unavailable (compile skipped)';
})();
let paused = false, speed = 1, mres = 1280, mk = 24, t = 0, last = performance.now();
let emaA = 0, emaB = 0, lastMeter = 0;
const bind = (id, fn) => document.getElementById(id).addEventListener('input', fn);
document.getElementById('pause').onclick = (e) => { paused = !paused; e.target.textContent = paused ? 'play' : 'pause'; };
bind('speed', (e) => { speed = +e.target.value; document.getElementById('speedv').textContent = speed.toFixed(2) + '×'; });
bind('mres', (e) => { mres = +e.target.value; document.getElementById('mresv').textContent = mres; });
bind('mk', (e) => { mk = +e.target.value; document.getElementById('mkv').textContent = mk; });
const fmt = (ms) => ms >= 1 ? ms.toFixed(2) + ' ms' : (ms * 1000).toFixed(0) + ' µs';
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  if (!paused) t += dt * speed;
  if (A) A.draw(t);
  if (B) B.draw(t);
  if (now - lastMeter > 350) {
    lastMeter = now;
    if (A) { A.resizeMeter(mres); const ms = A.measure(t, mk); emaA = emaA ? emaA * 0.7 + ms * 0.3 : ms; document.getElementById('ma').innerHTML = fmt(emaA) + ' <small>@' + mres + '×' + mk + '</small>'; }
    if (B) { B.resizeMeter(mres); const ms = B.measure(t, mk); emaB = emaB ? emaB * 0.7 + ms * 0.3 : ms; document.getElementById('mb').innerHTML = fmt(emaB) + ' <small>@' + mres + '×' + mk + '</small>'; }
    if (emaA && emaB) {
      const ratio = emaA / emaB, v = document.getElementById('verdict');
      if (ratio > 1.02) v.innerHTML = 'B is <b>' + ratio.toFixed(2) + '×</b> faster (' + (100 - 100 / ratio).toFixed(0) + '% less GPU time)';
      else if (ratio < 0.98) v.innerHTML = 'A is <b>' + (1 / ratio).toFixed(2) + '×</b> faster (B costs ' + (100 / ratio - 100).toFixed(0) + '% more)';
      else v.innerHTML = 'within noise (' + ratio.toFixed(3) + '×) — crank meter-res / overdraw to separate them';
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script></body></html>`;
}

async function openInBrowser(file: string): Promise<void> {
  const winPath = await $`wslpath -w ${file}`.quiet().nothrow();
  if (winPath.exitCode === 0) {
    const p = winPath.stdout.toString().trim();
    const opened = await $`explorer.exe ${p}`.quiet().nothrow();
    if (opened.exitCode === 0 || opened.exitCode === 1) return; // explorer.exe returns 1 even on success
  }
  await $`wslview ${file}`.quiet().nothrow();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (args.length < 1 || args.length > 2) {
    console.error('usage: bun run scripts/shader-view.ts <A> <B>');
    console.error('       bun run scripts/shader-view.ts <shader>   # vs git HEAD');
    process.exit(2);
  }

  let a: Side;
  let b: Side;
  if (args.length === 2) {
    a = await resolveSide(readFileSync(args[0], 'utf8'), args[0], args[0]);
    b = await resolveSide(readFileSync(args[1], 'utf8'), args[1], args[1]);
  } else {
    const [path] = args;
    const headRel = `HEAD:${relative(REPO_ROOT, resolve(process.cwd(), path))}`;
    a = await resolveSide(await gitHeadVersion(path), path, headRel);
    b = await resolveSide(readFileSync(path, 'utf8'), path, `${path} (working tree)`);
  }

  // Sliders are shared by uniform NAME, so a uniform the OTHER side documents in
  // its .ts is still controllable here; drop the redundant per-uniform notes.
  const controlled = new Set([...a.controls, ...b.controls].map((c) => c.name));
  const keep = (n: string) =>
    !(/ not in \.ts; defaulted$/.test(n) && controlled.has(n.split(' ')[0]));
  a.notes = a.notes.filter(keep);
  b.notes = b.notes.filter(keep);

  // Static op cost per side (GPU-independent, deterministic). Best-effort: a
  // compile failure here must not block the visual viewer.
  const [costA, costB] = await Promise.all([
    shaderCost(a.fragSrc, 'frag').catch(() => null),
    shaderCost(b.fragSrc, 'frag').catch(() => null),
  ]);

  const dir = mkdtempSync(join(tmpdir(), 'shader-view-'));
  const out = join(dir, 'shader-ab.html');
  writeFileSync(out, html([a, b], FULLSCREEN_VERT, [costA, costB]));
  console.log(`wrote ${out}`);
  if (costA && costB) {
    console.log(
      `  static cost: A ${costA.weighted} wt / ${costA.expensive} transcendental, B ${costB.weighted} wt / ${costB.expensive} transcendental (Δ ${costB.weighted - costA.weighted} wt)`,
    );
  }
  for (const note of [...a.notes, ...b.notes]) console.log(`  note: ${note}`);
  await openInBrowser(out);
  console.log('opened in browser (re-run after edits to refresh).');
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
