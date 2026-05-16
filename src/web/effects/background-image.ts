// Web background-image effect. Same composite pattern as the blur effect:
// MediaPipe Selfie Segmentation produces a person mask, then a WebGL2
// composite shader mixes the original camera frame and the background image
// based on the mask.
//
// Difference from blur: instead of generating the background from two
// Gaussian passes on the camera, the background is a still image loaded
// once from the URL the consumer passes in. Cached per-source URL.

import type { FrameTransform } from '../insertable-streams';

// --- segmentation (shared shape with blur.ts; will extract later) ----------

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

// --- WebGL2 shaders --------------------------------------------------------

const VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 1), float(gl_VertexID & 2));
  vUv = p * 0.5;
  gl_Position = vec4(p - 1.0, 0.0, 1.0);
}
`;

// Composite: mix(background, original, mask).
//
// MediaPipe's segmentationMask and ImageBitmaps created from fetched PNGs
// both arrive Y-flipped relative to the camera frame in our pipeline, and
// UNPACK_FLIP_Y_WEBGL has no visible corrective effect on either source at
// upload time. Flip V here so both align with the original.
const COMPOSITE_FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uOriginal;
uniform sampler2D uBackground;
uniform sampler2D uMask;
in vec2 vUv;
out vec4 oColor;
void main() {
  // smoothstep tightens MediaPipe's soft confidence map into a sharper
  // edge. lo/hi narrower = harder cutout.
  vec2 flipped = vec2(vUv.x, 1.0 - vUv.y);
  float raw = texture(uMask, flipped).r;
  float m = smoothstep(0.35, 0.65, raw);
  vec3 orig = texture(uOriginal, vUv).rgb;
  vec3 bg = texture(uBackground, flipped).rgb;
  oColor = vec4(mix(bg, orig, m), 1.0);
}
`;

// --- WebGL plumbing --------------------------------------------------------

type GpuState = {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  program: WebGLProgram;
  textures: {
    original: WebGLTexture;
    mask: WebGLTexture;
    background: WebGLTexture;
  };
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

// --- Per-source caching ----------------------------------------------------

type CacheEntry = {
  state: GpuState | null;
  imagePromise: Promise<ImageBitmap>;
  inputCanvas2D: OffscreenCanvas | null;
  inputCtx2D: OffscreenCanvasRenderingContext2D | null;
};

const cache = new Map<string, CacheEntry>();

const loadImage = (source: string): Promise<ImageBitmap> =>
  fetch(source, { mode: 'cors' })
    .then((r) => {
      if (!r.ok) throw new Error(`kaleidoscope: failed to fetch background image: ${r.status}`);
      return r.blob();
    })
    .then((blob) => createImageBitmap(blob));

const ensureState = (entry: CacheEntry, width: number, height: number): GpuState => {
  if (entry.state && entry.state.width === width && entry.state.height === height) {
    return entry.state;
  }
  if (entry.state) {
    const { gl } = entry.state;
    gl.deleteProgram(entry.state.program);
    gl.deleteTexture(entry.state.textures.original);
    gl.deleteTexture(entry.state.textures.mask);
    gl.deleteTexture(entry.state.textures.background);
  }

  const canvas = entry.state?.canvas ?? new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error(
      'kaleidoscope: WebGL2 not available; background-image requires a WebGL2-capable browser',
    );
  }

  entry.state = {
    gl,
    canvas,
    width,
    height,
    program: linkProgram(gl, VERT_SRC, COMPOSITE_FRAG_SRC),
    textures: {
      original: createTexture(gl, width, height),
      mask: createTexture(gl, width, height),
      background: createTexture(gl, width, height),
    },
  };
  return entry.state;
};

const ensureInputCanvas = (
  entry: CacheEntry,
  width: number,
  height: number,
): OffscreenCanvasRenderingContext2D => {
  if (
    !entry.inputCanvas2D ||
    entry.inputCanvas2D.width !== width ||
    entry.inputCanvas2D.height !== height
  ) {
    entry.inputCanvas2D = new OffscreenCanvas(width, height);
    entry.inputCtx2D = entry.inputCanvas2D.getContext('2d');
    if (!entry.inputCtx2D) {
      throw new Error('kaleidoscope: OffscreenCanvas 2D context unavailable');
    }
  }
  return entry.inputCtx2D as OffscreenCanvasRenderingContext2D;
};

// --- The effect factory ----------------------------------------------------

export const makeBackgroundImage = (source: string): FrameTransform => {
  let entry = cache.get(source);
  if (!entry) {
    entry = {
      state: null,
      imagePromise: loadImage(source),
      inputCanvas2D: null,
      inputCtx2D: null,
    };
    cache.set(source, entry);
  }
  const e = entry;

  return async (frame) => {
    const [segmenter, image] = await Promise.all([loadSegmenter(), e.imagePromise]);
    const w = frame.displayWidth;
    const h = frame.displayHeight;

    const inputCtx = ensureInputCanvas(e, w, h);
    inputCtx.drawImage(frame, 0, 0, w, h);
    const inputCanvas = e.inputCanvas2D as unknown as CanvasImageSource;

    const results: SegmenterResults = await new Promise((resolve) => {
      segmenter.onResults((r) => resolve(r));
      void segmenter.send({ image: inputCanvas });
    });

    const s = ensureState(e, w, h);
    const { gl, canvas, program, textures } = s;

    // Same flip semantics as blur: camera frame is DOM-coord, flip on upload.
    // Mask is MediaPipe-internal (WebGL Y-up already), do not flip.
    // Background image: depends on source orientation; ImageBitmap from blob
    // is DOM-coord, flip on upload to match the camera.
    uploadTexture(gl, textures.original, inputCanvas as unknown as TexImageSource, true);
    uploadTexture(gl, textures.mask, results.segmentationMask as unknown as TexImageSource, false);
    uploadTexture(gl, textures.background, image as unknown as TexImageSource, true);

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.original);
    gl.uniform1i(gl.getUniformLocation(program, 'uOriginal'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.background);
    gl.uniform1i(gl.getUniformLocation(program, 'uBackground'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textures.mask);
    gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
      timestamp: frame.timestamp,
      ...(frame.duration != null ? { duration: frame.duration } : {}),
    });
    frame.close();
    return out;
  };
};
