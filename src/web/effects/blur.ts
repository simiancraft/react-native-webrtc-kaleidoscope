// Web blur effect, WebGL2 pipeline.
//
// Same shape as the Android GLES 3.0 path: separable Gaussian blur into a
// ping-pong FBO, then a composite pass that mixes blurred and original via
// a segmentation mask. The mask still comes from MediaPipe Selfie
// Segmentation loaded from CDN; there is no GPU-resident segmenter for
// the web yet.
//
// Shader source lives in src/web/shaders.ts; MediaPipe loader in
// src/web/segmenter.ts. This file owns only the per-effect GL state and
// the per-frame transform.

import { computeBlurKernel } from '../blur-kernel';
import type { FrameTransform } from '../insertable-streams';
import { getLatestMask, loadSegmenter, requestMaskIfIdle } from '../segmenter';
import { BLUR_FRAG_SRC, COMPOSITE_FRAG_SRC, PASSTHROUGH_VERT_SRC } from '../shaders';
import { maskSmoothstepRange, tuning } from '../tuning';

// Cache the kernel by sigma; the pure math lives in ../blur-kernel. Recomputed
// only when the blur slider (setBlurSigma) moves, not per frame.
let cachedKernelSigma = Number.NaN;
let cachedKernel: { weights: Float32Array; offsets: Float32Array } | null = null;

const blurKernel = (sigma: number): { weights: Float32Array; offsets: Float32Array } => {
  if (sigma !== cachedKernelSigma || cachedKernel === null) {
    cachedKernel = computeBlurKernel(sigma);
    cachedKernelSigma = sigma;
  }
  return cachedKernel;
};

type GpuState = {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  // Blur ping-pong buffers run at quarter area (half each axis, short side
  // floored at 256px); the composite's LINEAR sampler upscales for free.
  downW: number;
  downH: number;
  programs: {
    blur: BlurProgram;
    composite: CompositeProgram;
  };
  timer: PassTimer;
  textures: {
    original: WebGLTexture;
    mask: WebGLTexture;
    blurA: WebGLTexture;
    blurB: WebGLTexture;
  };
  fbos: {
    blurA: WebGLFramebuffer;
    blurB: WebGLFramebuffer;
  };
};

let state: GpuState | null = null;

// MediaPipe needs a 2D canvas as input; we stage the VideoFrame there each
// frame, then point both MediaPipe and the GL upload at it.
let inputCanvas2D: OffscreenCanvas | null = null;
let inputCtx2D: OffscreenCanvasRenderingContext2D | null = null;

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('kaleidoscope: gl.createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no info log)';
    gl.deleteShader(shader);
    throw new Error(`kaleidoscope: shader compile failed: ${log}\n---\n${source}`);
  }
  return shader;
};

const linkProgram = (
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error('kaleidoscope: gl.createProgram returned null');
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.detachShader(prog, vs);
  gl.detachShader(prog, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? '(no info log)';
    gl.deleteProgram(prog);
    throw new Error(`kaleidoscope: program link failed: ${log}`);
  }
  return prog;
};

// Uniform locations queried once at link, not via getUniformLocation per frame.
type BlurProgram = {
  prog: WebGLProgram;
  uTex: WebGLUniformLocation | null;
  uAxis: WebGLUniformLocation | null;
  uWeights: WebGLUniformLocation | null;
  uOffsets: WebGLUniformLocation | null;
};
type CompositeProgram = {
  prog: WebGLProgram;
  uOriginal: WebGLUniformLocation | null;
  uBackground: WebGLUniformLocation | null;
  uMask: WebGLUniformLocation | null;
  uBgUvScale: WebGLUniformLocation | null;
  uBgUvOffset: WebGLUniformLocation | null;
  uMaskUvScale: WebGLUniformLocation | null;
  uMaskUvOffset: WebGLUniformLocation | null;
  uMaskLo: WebGLUniformLocation | null;
  uMaskHi: WebGLUniformLocation | null;
};

const linkBlurProgram = (gl: WebGL2RenderingContext): BlurProgram => {
  const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, BLUR_FRAG_SRC);
  return {
    prog,
    uTex: gl.getUniformLocation(prog, 'uTex'),
    uAxis: gl.getUniformLocation(prog, 'uAxis'),
    uWeights: gl.getUniformLocation(prog, 'uWeights'),
    uOffsets: gl.getUniformLocation(prog, 'uOffsets'),
  };
};

const linkCompositeProgram = (gl: WebGL2RenderingContext): CompositeProgram => {
  const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, COMPOSITE_FRAG_SRC);
  return {
    prog,
    uOriginal: gl.getUniformLocation(prog, 'uOriginal'),
    uBackground: gl.getUniformLocation(prog, 'uBackground'),
    uMask: gl.getUniformLocation(prog, 'uMask'),
    uBgUvScale: gl.getUniformLocation(prog, 'uBgUvScale'),
    uBgUvOffset: gl.getUniformLocation(prog, 'uBgUvOffset'),
    uMaskUvScale: gl.getUniformLocation(prog, 'uMaskUvScale'),
    uMaskUvOffset: gl.getUniformLocation(prog, 'uMaskUvOffset'),
    uMaskLo: gl.getUniformLocation(prog, 'uMaskLo'),
    uMaskHi: gl.getUniformLocation(prog, 'uMaskHi'),
  };
};

// Per-pass GPU timing (dev only). Set
// `globalThis.__KALEIDOSCOPE_DEBUG_TIMING__ = true` before the first blur frame
// to log per-pass GPU time via EXT_disjoint_timer_query_webgl2. Results read
// back one frame late (the query is async); a no-op when the flag/ext is absent.
const TIMING_ENABLED =
  (globalThis as { __KALEIDOSCOPE_DEBUG_TIMING__?: boolean }).__KALEIDOSCOPE_DEBUG_TIMING__ ===
  true;

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
type PassTimer = { ext: TimerExt | null; pending: Map<string, WebGLQuery> };

const makePassTimer = (gl: WebGL2RenderingContext): PassTimer => ({
  ext: TIMING_ENABLED
    ? (gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null)
    : null,
  pending: new Map(),
});

const timePass = (
  gl: WebGL2RenderingContext,
  timer: PassTimer,
  label: string,
  draw: () => void,
): void => {
  const ext = timer.ext;
  if (!ext) {
    draw();
    return;
  }
  const inFlight = timer.pending.get(label);
  if (inFlight) {
    const available = gl.getQueryParameter(inFlight, gl.QUERY_RESULT_AVAILABLE) as boolean;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    if (available && !disjoint) {
      const ns = gl.getQueryParameter(inFlight, gl.QUERY_RESULT) as number;
      console.debug(`[kaleidoscope] blur ${label}: ${(ns / 1e6).toFixed(3)} ms`);
    }
    if (available || disjoint) {
      gl.deleteQuery(inFlight);
      timer.pending.delete(label);
    }
    // A query is still in flight for this label; just draw, don't stack another.
    draw();
    return;
  }
  const query = gl.createQuery();
  if (!query) {
    draw();
    return;
  }
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  draw();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  timer.pending.set(label, query);
};

const createTexture = (gl: WebGL2RenderingContext, width: number, height: number): WebGLTexture => {
  const tex = gl.createTexture();
  if (!tex) throw new Error('kaleidoscope: gl.createTexture returned null');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
};

const createFbo = (gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer => {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('kaleidoscope: gl.createFramebuffer returned null');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`kaleidoscope: FBO incomplete: 0x${status.toString(16)}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
};

// Quarter-area downscale for the blur ping-pong buffers: half each axis, short
// side floored at 256px so small inputs don't degrade; never upscales. Shared
// rule with the Android/iOS R1 commits.
const blurDownscale = (w: number, h: number): { downW: number; downH: number } => {
  const shortTarget = Math.max(256, Math.round(Math.min(w, h) * 0.5));
  const scale = Math.min(1, shortTarget / Math.min(w, h));
  return { downW: Math.max(1, Math.round(w * scale)), downH: Math.max(1, Math.round(h * scale)) };
};

const ensureState = (width: number, height: number): GpuState => {
  if (state && state.width === width && state.height === height) return state;

  // Tear down previous state if dimensions changed.
  if (state) {
    const { gl } = state;
    gl.deleteProgram(state.programs.blur.prog);
    gl.deleteProgram(state.programs.composite.prog);
    for (const q of state.timer.pending.values()) gl.deleteQuery(q);
    gl.deleteTexture(state.textures.original);
    gl.deleteTexture(state.textures.mask);
    gl.deleteTexture(state.textures.blurA);
    gl.deleteTexture(state.textures.blurB);
    gl.deleteFramebuffer(state.fbos.blurA);
    gl.deleteFramebuffer(state.fbos.blurB);
  }

  const canvas = state?.canvas ?? new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error('kaleidoscope: WebGL2 not available; blur requires a WebGL2-capable browser');
  }

  const programs = {
    blur: linkBlurProgram(gl),
    composite: linkCompositeProgram(gl),
  };
  const { downW, downH } = blurDownscale(width, height);
  const textures = {
    original: createTexture(gl, width, height),
    mask: createTexture(gl, width, height),
    blurA: createTexture(gl, downW, downH),
    blurB: createTexture(gl, downW, downH),
  };
  const fbos = {
    blurA: createFbo(gl, textures.blurA),
    blurB: createFbo(gl, textures.blurB),
  };

  state = {
    gl,
    canvas,
    width,
    height,
    downW,
    downH,
    programs,
    timer: makePassTimer(gl),
    textures,
    fbos,
  };
  return state;
};

const ensureInputCanvas = (width: number, height: number): OffscreenCanvasRenderingContext2D => {
  if (!inputCanvas2D || inputCanvas2D.width !== width || inputCanvas2D.height !== height) {
    inputCanvas2D = new OffscreenCanvas(width, height);
    inputCtx2D = inputCanvas2D.getContext('2d');
    if (!inputCtx2D) throw new Error('kaleidoscope: OffscreenCanvas 2D context unavailable');
  }
  return inputCtx2D as OffscreenCanvasRenderingContext2D;
};

const uploadTexture = (
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  source: TexImageSource,
  flipY: boolean,
): void => {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
};

export const blur: FrameTransform = async (frame) => {
  await loadSegmenter(); // ensure the segmenter is loaded; cached after first call.
  const w = frame.displayWidth;
  const h = frame.displayHeight;

  // Stage on a 2D canvas so MediaPipe can ingest it (and so the GL upload below
  // has a flippable source).
  const inputCtx = ensureInputCanvas(w, h);
  inputCtx.drawImage(frame, 0, 0, w, h);
  const inputCanvas = inputCanvas2D as unknown as CanvasImageSource;

  // Decoupled segmentation (mirrors native): never block the render on the
  // segmenter. Kick a fresh mask only when idle and draw with the most recent
  // one. drawImage is atomic w.r.t. the event loop, so MediaPipe reading the
  // canvas between tasks sees at most a ~1-frame-newer image — within the
  // staleness the mask already tolerates. Before the first mask lands, forward
  // the original frame (matches native's fall-through).
  requestMaskIfIdle(inputCanvas);
  const results = getLatestMask();
  if (!results) {
    const passthrough = new VideoFrame(inputCanvas2D as unknown as CanvasImageSource, {
      timestamp: frame.timestamp,
      ...(frame.duration != null ? { duration: frame.duration } : {}),
    });
    frame.close();
    return passthrough;
  }

  // Run the GPU pipeline.
  const s = ensureState(w, h);
  const { gl, canvas, programs, timer, textures, fbos, downW, downH } = s;

  // Upload original with flipY=true (DOM-coord source → GL v=1 = top).
  // Upload mask with flipY=false: UNPACK_FLIP_Y_WEBGL is a no-op on
  // MediaPipe's segmentationMask (also on ImageBitmaps in general), so the
  // mask lands in its natural orientation. The composite shader compensates
  // with the uMaskUvScale=(1,-1) / uMaskUvOffset=(0,1) V-flip uniforms set
  // below; this also avoids the canvas-premultiplied-alpha problem that
  // collapses soft confidence values and makes the mask binary.
  uploadTexture(gl, textures.original, inputCanvas as unknown as TexImageSource, true);
  uploadTexture(gl, textures.mask, results.segmentationMask as unknown as TexImageSource, false);

  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);

  // Pass 1: horizontal blur of full-res original -> downscaled blurA
  // (bilinear minification + blur in one step).
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blurA);
  gl.viewport(0, 0, downW, downH);
  // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook (the early return above tripped the use* heuristic).
  gl.useProgram(programs.blur.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.original);
  gl.uniform1i(programs.blur.uTex, 0);
  gl.uniform2f(programs.blur.uAxis, 1 / downW, 0);
  // Upload the precomputed kernel; persists into the vertical pass below
  // (same program), which only swaps uAxis.
  const { weights, offsets } = blurKernel(tuning.blurSigma);
  gl.uniform1fv(programs.blur.uWeights, weights);
  gl.uniform1fv(programs.blur.uOffsets, offsets);
  timePass(gl, timer, 'h', () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4));

  // Pass 2: vertical blur of blurA -> blurB (both downscaled)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blurB);
  gl.viewport(0, 0, downW, downH);
  gl.bindTexture(gl.TEXTURE_2D, textures.blurA);
  gl.uniform2f(programs.blur.uAxis, 0, 1 / downH);
  timePass(gl, timer, 'v', () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4));

  // Pass 3: composite original + blurB + mask -> default framebuffer (canvas)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook (the early return above tripped the use* heuristic).
  gl.useProgram(programs.composite.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.original);
  gl.uniform1i(programs.composite.uOriginal, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, textures.blurB);
  gl.uniform1i(programs.composite.uBackground, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, textures.mask);
  gl.uniform1i(programs.composite.uMask, 2);
  // Blurred background is full-size; identity UV transform.
  gl.uniform2f(programs.composite.uBgUvScale, 1, 1);
  gl.uniform2f(programs.composite.uBgUvOffset, 0, 0);
  // Mask V-flip: direct upload with flipY=false leaves mask Y-inverted
  // relative to the original. Encode the flip in the sampling uniforms so
  // the shader stays byte-identical with Android (which uses identity here).
  gl.uniform2f(programs.composite.uMaskUvScale, 1, -1);
  gl.uniform2f(programs.composite.uMaskUvOffset, 0, 1);
  const [maskLo, maskHi] = maskSmoothstepRange(tuning.maskHardness, tuning.maskThreshold);
  gl.uniform1f(programs.composite.uMaskLo, maskLo);
  gl.uniform1f(programs.composite.uMaskHi, maskHi);
  timePass(gl, timer, 'composite', () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4));

  // Wrap the canvas as an output VideoFrame.
  const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
    timestamp: frame.timestamp,
    ...(frame.duration != null ? { duration: frame.duration } : {}),
  });
  frame.close();
  return out;
};
