// Web blur effect, WebGL2 pipeline.
//
// Same shape as the Android GLES 3.0 path: separable Gaussian blur into a
// ping-pong FBO, then a composite pass that mixes blurred and original via
// a segmentation mask. The mask still comes from MediaPipe Selfie
// Segmentation loaded from CDN — there is no GPU-resident segmenter for
// the web yet.
//
// GLSL ES 3.00 source is shared in shape with android/.../gpu/Shaders.kt;
// keep the math in sync manually for now. Extracts to a shared file when
// shader count earns it.

import type { FrameTransform } from '../insertable-streams';

// --- segmentation -----------------------------------------------------------

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation';

type SegmenterResults = {
  image: CanvasImageSource;
  segmentationMask: CanvasImageSource;
};
type SegmenterOptions = { selfieMode?: boolean; modelSelection?: number };
type Segmenter = {
  initialize(): Promise<void>;
  setOptions(opts: SegmenterOptions): void;
  onResults(cb: (r: SegmenterResults) => void): void;
  send(input: { image: CanvasImageSource }): Promise<void>;
  close(): Promise<void>;
};
type SegmenterCtor = new (config: { locateFile: (file: string) => string }) => Segmenter;

let segmenterPromise: Promise<Segmenter> | null = null;

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
    document.head.appendChild(script);
  });

const loadSegmenter = (): Promise<Segmenter> => {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    await loadScript(`${CDN_BASE}/selfie_segmentation.js`);
    const SegCtor = (globalThis as unknown as { SelfieSegmentation?: SegmenterCtor })
      .SelfieSegmentation;
    if (!SegCtor) {
      throw new Error(
        'kaleidoscope: MediaPipe Selfie Segmentation script loaded but SelfieSegmentation global is missing',
      );
    }
    const seg = new SegCtor({ locateFile: (file) => `${CDN_BASE}/${file}` });
    seg.setOptions({ modelSelection: 1, selfieMode: false });
    await seg.initialize();
    return seg;
  })();
  return segmenterPromise;
};

// --- WebGL2 plumbing --------------------------------------------------------

const VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 1), float(gl_VertexID & 2));
  vUv = p * 0.5;
  gl_Position = vec4(p - 1.0, 0.0, 1.0);
}
`;

// Separable 1D Gaussian. uAxis is (1/width, 0) for horizontal, (0, 1/height)
// for vertical. RADIUS is capped at 20 taps per side; uniform sigma controls
// the effective falloff. Taps beyond ~3*sigma contribute ~0 so high RADIUS
// with small sigma is wasteful but visually correct.
const BLUR_FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uAxis;
uniform float uSigma;
in vec2 vUv;
out vec4 oColor;
const int RADIUS = 20;
void main() {
  float sigma2 = uSigma * uSigma;
  vec4 sum = vec4(0.0);
  float wSum = 0.0;
  for (int i = -RADIUS; i <= RADIUS; i++) {
    float fi = float(i);
    float w = exp(-0.5 * fi * fi / sigma2);
    sum += texture(uTex, vUv + fi * uAxis) * w;
    wSum += w;
  }
  oColor = sum / wSum;
}
`;

// Composite: mix(blurred, original, mask). The mask comes in as a 4-channel
// texture from MediaPipe — use the red channel (greyscale).
const COMPOSITE_FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uOriginal;
uniform sampler2D uBlurred;
uniform sampler2D uMask;
in vec2 vUv;
out vec4 oColor;
void main() {
  float m = texture(uMask, vUv).r;
  vec3 orig = texture(uOriginal, vUv).rgb;
  vec3 blur = texture(uBlurred, vUv).rgb;
  oColor = vec4(mix(blur, orig, m), 1.0);
}
`;

const BLUR_SIGMA = 8.0;

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
    blur: linkProgram(gl, VERT_SRC, BLUR_FRAG_SRC),
    composite: linkProgram(gl, VERT_SRC, COMPOSITE_FRAG_SRC),
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

// --- the effect ------------------------------------------------------------

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

  // OffscreenCanvas and MediaPipe's mask image are both valid TexImageSource
  // at runtime; the lib.dom type narrowing on CanvasImageSource (which
  // includes SVGImageElement) is overly broad for our usage.
  //
  // flipY semantics: the input frame is in DOM coordinates (top-left origin)
  // so we flip it on upload to match WebGL's Y-up sampling. MediaPipe's
  // segmentationMask is already in WebGL Y-up internally; flipping it again
  // would double-flip it relative to the original and put the cutout above
  // the user's actual position in the frame.
  uploadTexture(gl, textures.original, inputCanvas as unknown as TexImageSource, true);
  uploadTexture(gl, textures.mask, results.segmentationMask as unknown as TexImageSource, false);

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
  gl.uniform1f(gl.getUniformLocation(programs.blur, 'uSigma'), BLUR_SIGMA);
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
  gl.uniform1i(gl.getUniformLocation(programs.composite, 'uBlurred'), 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, textures.mask);
  gl.uniform1i(gl.getUniformLocation(programs.composite, 'uMask'), 2);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Wrap the canvas as an output VideoFrame.
  const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
    timestamp: frame.timestamp,
    ...(frame.duration != null ? { duration: frame.duration } : {}),
  });
  frame.close();
  return out;
};
