// Web background-image effect. Same composite pattern as the blur effect:
// MediaPipe Selfie Segmentation produces a person mask, then a WebGL2
// composite shader mixes the original camera frame and the background image
// based on the mask.
//
// Difference from blur: instead of generating the background from two
// Gaussian passes on the camera, the background is a still image loaded
// once from the URL the consumer passes in. Cached per-source URL.
//
// Shader source lives in src/web/shaders.ts; MediaPipe loader in
// src/web/segmenter.ts.

import type { FrameTransform } from '../insertable-streams';
import { getLatestMask, loadSegmenter, requestMaskIfIdle } from '../segmenter';
import { COMPOSITE_FRAG_SRC, PASSTHROUGH_VERT_SRC } from '../shaders';
import { maskSmoothstepRange, tuning } from '../tuning';

// Uniform locations queried once at link, not via getUniformLocation per frame
// (mirrors src/web/effects/blur.ts; the composite shader is identical).
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
  program: CompositeProgram;
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
  // The bg image is staged onto an OffscreenCanvas at load time because
  // UNPACK_FLIP_Y_WEBGL is silently a no-op on ImageBitmaps; we want
  // flipY to actually flip on upload, and it works on canvas sources.
  imagePromise: Promise<{ canvas: OffscreenCanvas; width: number; height: number }>;
  inputCanvas2D: OffscreenCanvas | null;
  inputCtx2D: OffscreenCanvasRenderingContext2D | null;
};

const cache = new Map<string, CacheEntry>();

// SECURITY: `source` is consumer-supplied and may be an arbitrary URL or data
// URI (see BackgroundImageSpec.source). Two bounds keep an untrusted source
// from becoming a memory-pressure DoS:
//   - MAX_BG_DIMENSION caps the decoded raster so a "decompression bomb" (a
//     small file that decodes to hundreds of megapixels) is downscaled rather
//     than fully buffered. A background is cover-fit anyway, so the cap costs
//     nothing visible.
//   - MAX_CACHE_ENTRIES bounds the per-source cache so a stream of distinct
//     URLs cannot grow it without limit.
// Consumers wiring `source` from end-user input should still validate the URL
// themselves; this library does not fetch-allowlist.
const MAX_BG_DIMENSION = 4096;
const MAX_CACHE_ENTRIES = 32;

const loadImage = (
  source: string,
): Promise<{ canvas: OffscreenCanvas; width: number; height: number }> =>
  fetch(source, { mode: 'cors' })
    .then((r) => {
      if (!r.ok) throw new Error(`kaleidoscope: failed to fetch background image: ${r.status}`);
      return r.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      const longSide = Math.max(bitmap.width, bitmap.height);
      const scale = longSide > MAX_BG_DIMENSION ? MAX_BG_DIMENSION / longSide : 1;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('kaleidoscope: bg OffscreenCanvas 2D context unavailable');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return { canvas, width, height };
    });

// Free an entry's GL resources before dropping it from the cache.
const disposeEntry = (entry: CacheEntry): void => {
  if (!entry.state) return;
  const { gl, program, textures } = entry.state;
  gl.deleteProgram(program.prog);
  gl.deleteTexture(textures.original);
  gl.deleteTexture(textures.mask);
  gl.deleteTexture(textures.background);
  entry.state = null;
};

const ensureState = (
  entry: CacheEntry,
  width: number,
  height: number,
  bg: { canvas: OffscreenCanvas; width: number; height: number },
): GpuState => {
  if (entry.state && entry.state.width === width && entry.state.height === height) {
    return entry.state;
  }
  if (entry.state) {
    const { gl } = entry.state;
    gl.deleteProgram(entry.state.program.prog);
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
    program: linkCompositeProgram(gl),
    textures: {
      original: createTexture(gl, width, height),
      mask: createTexture(gl, width, height),
      background: createTexture(gl, width, height),
    },
  };
  // Static background: upload once, here, not per frame. Re-runs only when
  // this state is rebuilt (resolution change). flipY=true matches the
  // original's DOM-coord → GL v=1 convention.
  uploadTexture(gl, entry.state.textures.background, bg.canvas as unknown as TexImageSource, true);
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
    // Bound the cache: evict the oldest entry (Map preserves insertion order)
    // and free its GL resources before inserting a new source.
    while (cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = cache.get(oldestKey);
      if (oldest) disposeEntry(oldest);
      cache.delete(oldestKey);
    }
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
    const bg = await e.imagePromise;
    await loadSegmenter(); // ensure loaded; cached after first call.
    const w = frame.displayWidth;
    const h = frame.displayHeight;

    const inputCtx = ensureInputCanvas(e, w, h);
    inputCtx.drawImage(frame, 0, 0, w, h);
    const inputCanvas = e.inputCanvas2D as unknown as CanvasImageSource;

    // Decoupled segmentation; see blur.ts for the rationale. Forward the
    // original frame until the first mask lands.
    requestMaskIfIdle(inputCanvas);
    const results = getLatestMask();
    if (!results) {
      const passthrough = new VideoFrame(e.inputCanvas2D as unknown as CanvasImageSource, {
        timestamp: frame.timestamp,
        ...(frame.duration != null ? { duration: frame.duration } : {}),
      });
      frame.close();
      return passthrough;
    }

    const s = ensureState(e, w, h, bg);
    const { gl, canvas, program, textures } = s;

    // Upload original with flipY=true (DOM-coord → GL v=1 = top). The static
    // background is uploaded once in ensureState (flipped the same way), not
    // per frame. Mask is uploaded with flipY=false for the same reason
    // (no-op on MediaPipe's segmentationMask source) AND to preserve the soft
    // confidence values — canvas premultiplied-alpha math would collapse them
    // to near-binary. The composite shader compensates via
    // uMaskUvScale=(1,-1) / uMaskUvOffset=(0,1) set below.
    uploadTexture(gl, textures.original, inputCanvas as unknown as TexImageSource, true);
    uploadTexture(gl, textures.mask, results.segmentationMask as unknown as TexImageSource, false);

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook (the early return above tripped the use* heuristic).
    gl.useProgram(program.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.original);
    gl.uniform1i(program.uOriginal, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.background);
    gl.uniform1i(program.uBackground, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textures.mask);
    gl.uniform1i(program.uMask, 2);
    // Cover-fit center crop: scale the smaller axis to fit, offset to
    // center. Mirrors android/.../effects/BackgroundImageFactory.kt.
    const outAspect = w / h;
    const bgAspect = bg.width / bg.height;
    let bgScaleX: number;
    let bgScaleY: number;
    let bgOffsetX: number;
    let bgOffsetY: number;
    if (bgAspect > outAspect) {
      bgScaleX = outAspect / bgAspect;
      bgScaleY = 1.0;
      bgOffsetX = (1 - bgScaleX) * 0.5;
      bgOffsetY = 0;
    } else {
      bgScaleX = 1.0;
      bgScaleY = bgAspect / outAspect;
      bgOffsetX = 0;
      bgOffsetY = (1 - bgScaleY) * 0.5;
    }
    gl.uniform2f(program.uBgUvScale, bgScaleX, bgScaleY);
    gl.uniform2f(program.uBgUvOffset, bgOffsetX, bgOffsetY);
    // Mask V-flip via sampling uniforms; see comment on the upload above.
    gl.uniform2f(program.uMaskUvScale, 1, -1);
    gl.uniform2f(program.uMaskUvOffset, 0, 1);
    const [maskLo, maskHi] = maskSmoothstepRange(tuning.maskHardness, tuning.maskThreshold);
    gl.uniform1f(program.uMaskLo, maskLo);
    gl.uniform1f(program.uMaskHi, maskHi);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
      timestamp: frame.timestamp,
      ...(frame.duration != null ? { duration: frame.duration } : {}),
    });
    frame.close();
    return out;
  };
};
