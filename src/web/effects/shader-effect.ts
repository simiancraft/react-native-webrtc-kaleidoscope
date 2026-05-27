// Web generic procedural-shader processor (issue #25/#32).
//
// Runs an ARBITRARY generative fragment shader into the composite's background
// slot, fed a per-frame `uTime` host clock and a caller-supplied uniform map,
// then composites the segmented person over it through the existing mask path.
// Plasma is its first caller; nebula/simianlights drop in by passing a
// different frag + uniforms, with no new processor code.
//
// Standard generative uniforms (`uTime`, `uResolution`) are supplied here; the
// caller passes the rest by name (e.g. `uColorA`, `uSpeed`), bound by value
// type. One art effect is ever active (single art axis), so module-level GL
// state is correct; it rebuilds on a resolution or shader-source change.

import type { FrameTransform } from '../insertable-streams';
import { getLatestMask, loadSegmenter, requestMaskIfIdle } from '../segmenter';
import { COMPOSITE_FRAG_SRC, PASSTHROUGH_VERT_SRC } from '../shaders';
import { maskSmoothstepRange, tuning } from '../tuning';

/** A shader uniform value: a float or a small vector (length 2–4). */
type Uniform = number | readonly number[];
type UniformMap = Readonly<Record<string, Uniform>>;

type ShaderProgram = {
  prog: WebGLProgram;
  uTime: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uniforms: Map<string, WebGLUniformLocation | null>;
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

type GpuState = {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  fragSource: string;
  programs: { shader: ShaderProgram; composite: CompositeProgram };
  textures: { original: WebGLTexture; mask: WebGLTexture; background: WebGLTexture };
  fbos: { background: WebGLFramebuffer };
};

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

const linkShaderProgram = (
  gl: WebGL2RenderingContext,
  fragSource: string,
  uniformNames: readonly string[],
): ShaderProgram => {
  const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, fragSource);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  for (const name of uniformNames) uniforms.set(name, gl.getUniformLocation(prog, name));
  return {
    prog,
    uTime: gl.getUniformLocation(prog, 'uTime'),
    uResolution: gl.getUniformLocation(prog, 'uResolution'),
    uniforms,
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

const bindUniform = (
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  value: Uniform,
): void => {
  if (loc == null) return;
  if (typeof value === 'number') gl.uniform1f(loc, value);
  else if (value.length === 2) gl.uniform2fv(loc, new Float32Array(value));
  else if (value.length === 3) gl.uniform3fv(loc, new Float32Array(value));
  else if (value.length === 4) gl.uniform4fv(loc, new Float32Array(value));
};

let state: GpuState | null = null;
let inputCanvas2D: OffscreenCanvas | null = null;
let inputCtx2D: OffscreenCanvasRenderingContext2D | null = null;

const ensureState = (
  width: number,
  height: number,
  fragSource: string,
  uniformNames: readonly string[],
): GpuState => {
  if (
    state &&
    state.width === width &&
    state.height === height &&
    state.fragSource === fragSource
  ) {
    return state;
  }
  if (state) {
    const { gl, programs, textures, fbos } = state;
    gl.deleteProgram(programs.shader.prog);
    gl.deleteProgram(programs.composite.prog);
    gl.deleteTexture(textures.original);
    gl.deleteTexture(textures.mask);
    gl.deleteTexture(textures.background);
    gl.deleteFramebuffer(fbos.background);
  }

  const canvas = state?.canvas ?? new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error('kaleidoscope: WebGL2 not available; shader effects require a WebGL2 browser');
  }

  const background = createTexture(gl, width, height);
  state = {
    gl,
    canvas,
    width,
    height,
    fragSource,
    programs: {
      shader: linkShaderProgram(gl, fragSource, uniformNames),
      composite: linkCompositeProgram(gl),
    },
    textures: {
      original: createTexture(gl, width, height),
      mask: createTexture(gl, width, height),
      background,
    },
    fbos: { background: createFbo(gl, background) },
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

export const makeShaderEffect = (fragSource: string, uniforms: UniformMap): FrameTransform => {
  const uniformNames = Object.keys(uniforms);

  return async (frame) => {
    await loadSegmenter();
    const w = frame.displayWidth;
    const h = frame.displayHeight;

    const inputCtx = ensureInputCanvas(w, h);
    inputCtx.drawImage(frame, 0, 0, w, h);
    const inputCanvas = inputCanvas2D as unknown as CanvasImageSource;

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

    const s = ensureState(w, h, fragSource, uniformNames);
    const { gl, canvas, programs, textures, fbos } = s;

    uploadTexture(gl, textures.original, inputCanvas as unknown as TexImageSource, true);
    uploadTexture(gl, textures.mask, results.segmentationMask as unknown as TexImageSource, false);

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // Pass 0: render the generative shader into the background texture. Host
    // monotonic clock so the animation advances independent of camera timing.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.background);
    gl.viewport(0, 0, w, h);
    // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
    gl.useProgram(programs.shader.prog);
    gl.uniform1f(programs.shader.uTime, performance.now() / 1000);
    gl.uniform2f(programs.shader.uResolution, w, h);
    for (const [name, value] of Object.entries(uniforms)) {
      bindUniform(gl, programs.shader.uniforms.get(name) ?? null, value);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 1: composite original + shader background + mask -> canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
    gl.useProgram(programs.composite.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.original);
    gl.uniform1i(programs.composite.uOriginal, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.background);
    gl.uniform1i(programs.composite.uBackground, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textures.mask);
    gl.uniform1i(programs.composite.uMask, 2);
    gl.uniform2f(programs.composite.uBgUvScale, 1, 1);
    gl.uniform2f(programs.composite.uBgUvOffset, 0, 0);
    gl.uniform2f(programs.composite.uMaskUvScale, 1, -1);
    gl.uniform2f(programs.composite.uMaskUvOffset, 0, 1);
    const [maskLo, maskHi] = maskSmoothstepRange(tuning.maskHardness, tuning.maskThreshold);
    gl.uniform1f(programs.composite.uMaskLo, maskLo);
    gl.uniform1f(programs.composite.uMaskHi, maskHi);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
      timestamp: frame.timestamp,
      ...(frame.duration != null ? { duration: frame.duration } : {}),
    });
    frame.close();
    return out;
  };
};
