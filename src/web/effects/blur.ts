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

import type { FrameTransform } from '../insertable-streams';
import { loadSegmenter, type SegmenterResults } from '../segmenter';
import { BLUR_FRAG_SRC, COMPOSITE_FRAG_SRC, PASSTHROUGH_VERT_SRC } from '../shaders';
import { maskHardnessRange, tuning } from '../tuning';

type GpuState = {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  programs: {
    blur: WebGLProgram;
    composite: WebGLProgram;
  };
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

const ensureState = (width: number, height: number): GpuState => {
  if (state && state.width === width && state.height === height) return state;

  // Tear down previous state if dimensions changed.
  if (state) {
    const { gl } = state;
    gl.deleteProgram(state.programs.blur);
    gl.deleteProgram(state.programs.composite);
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
    blur: linkProgram(gl, PASSTHROUGH_VERT_SRC, BLUR_FRAG_SRC),
    composite: linkProgram(gl, PASSTHROUGH_VERT_SRC, COMPOSITE_FRAG_SRC),
  };
  const textures = {
    original: createTexture(gl, width, height),
    mask: createTexture(gl, width, height),
    blurA: createTexture(gl, width, height),
    blurB: createTexture(gl, width, height),
  };
  const fbos = {
    blurA: createFbo(gl, textures.blurA),
    blurB: createFbo(gl, textures.blurB),
  };

  state = { gl, canvas, width, height, programs, textures, fbos };
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
  const segmenter = await loadSegmenter();
  const w = frame.displayWidth;
  const h = frame.displayHeight;

  // Stage on a 2D canvas so MediaPipe can ingest it.
  const inputCtx = ensureInputCanvas(w, h);
  inputCtx.drawImage(frame, 0, 0, w, h);
  const inputCanvas = inputCanvas2D as unknown as CanvasImageSource;

  // Get the mask from MediaPipe.
  const results: SegmenterResults = await new Promise((resolve) => {
    segmenter.onResults((r) => resolve(r));
    void segmenter.send({ image: inputCanvas });
  });

  // Run the GPU pipeline.
  const s = ensureState(w, h);
  const { gl, canvas, programs, textures, fbos } = s;

  // Texture-orientation convention: every input lands with semantic "top
  // of source image" at GL v=1. We achieve that by uploading every source
  // with UNPACK_FLIP_Y_WEBGL=true. The composite shader then samples at
  // vUv directly, no V-flips. See COMPOSITE_FRAG_SRC docstring for the
  // cross-platform contract.
  uploadTexture(gl, textures.original, inputCanvas as unknown as TexImageSource, true);
  uploadTexture(gl, textures.mask, results.segmentationMask as unknown as TexImageSource, true);

  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);

  // Pass 1: horizontal blur of original -> blurA
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blurA);
  gl.viewport(0, 0, w, h);
  gl.useProgram(programs.blur);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.original);
  gl.uniform1i(gl.getUniformLocation(programs.blur, 'uTex'), 0);
  gl.uniform2f(gl.getUniformLocation(programs.blur, 'uAxis'), 1 / w, 0);
  gl.uniform1f(gl.getUniformLocation(programs.blur, 'uSigma'), tuning.blurSigma);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Pass 2: vertical blur of blurA -> blurB
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blurB);
  gl.viewport(0, 0, w, h);
  gl.bindTexture(gl.TEXTURE_2D, textures.blurA);
  gl.uniform2f(gl.getUniformLocation(programs.blur, 'uAxis'), 0, 1 / h);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Pass 3: composite original + blurB + mask -> default framebuffer (canvas)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.useProgram(programs.composite);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.original);
  gl.uniform1i(gl.getUniformLocation(programs.composite, 'uOriginal'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, textures.blurB);
  gl.uniform1i(gl.getUniformLocation(programs.composite, 'uBackground'), 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, textures.mask);
  gl.uniform1i(gl.getUniformLocation(programs.composite, 'uMask'), 2);
  // The blurred background is the same dimensions as the original; identity
  // UV transform on uBgUvScale / uBgUvOffset.
  gl.uniform2f(gl.getUniformLocation(programs.composite, 'uBgUvScale'), 1, 1);
  gl.uniform2f(gl.getUniformLocation(programs.composite, 'uBgUvOffset'), 0, 0);
  const [maskLo, maskHi] = maskHardnessRange(tuning.maskHardness);
  gl.uniform1f(gl.getUniformLocation(programs.composite, 'uMaskLo'), maskLo);
  gl.uniform1f(gl.getUniformLocation(programs.composite, 'uMaskHi'), maskHi);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Wrap the canvas as an output VideoFrame.
  const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
    timestamp: frame.timestamp,
    ...(frame.duration != null ? { duration: frame.duration } : {}),
  });
  frame.close();
  return out;
};
