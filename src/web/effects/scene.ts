// Web scene compositor: render a painter's stack of layers into one frame.
//
// This is the LAYERED path (distinct from the serial single-effect chain in
// index.web.ts). A scene is one stage: layer 0 is the opaque base, later layers
// blend over it in array order. Each layer is `{ shader, target?, blend? }`:
//   - shader 'image'  : replace the target with a still texture (cover-fit).
//   - shader 'direct' : passthrough. On target 'subject' that is the masked
//     camera person; on 'background' it is a no-op.
//   - a generative shader (e.g. 'godrays') : render its frag with `uniforms`.
//   - target defaults to 'background'; 'subject' stencils to the segmented person.
//
// A layer that targets the subject (or a 'direct' subject layer) brings in
// segmentation; a scene with none ignores the camera (pure generated background).
// The mask edge is the shared mask() tuning, so the demo sliders drive scenes.

import type { LayerSpec } from '../../types';
import type { FrameTransform } from '../insertable-streams';
import { getLatestMask, loadSegmenter, requestMaskIfIdle } from '../segmenter';
import { PASSTHROUGH_VERT_SRC } from '../shaders';
import { maskSmoothstepRange, tuning } from '../tuning';
import { LAYER_SHADER_SOURCES } from './layer-shaders';

const BLIT_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uCoverScale;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec2 uv = (vUv - 0.5) * uCoverScale + 0.5;
  vec4 c = texture(uTex, uv);
  // Premultiply so a straight-alpha image (transparent sky/opening) composites
  // correctly with the "over" blend: transparent regions show the stack beneath.
  oColor = vec4(c.rgb * c.a, c.a);
}
`;

// Subject: the masked camera person, output PREMULTIPLIED (rgb already scaled by
// the mask alpha) so a normal "over" blend composites the person onto the stack.
const SUBJECT_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uCamera;
uniform sampler2D uMask;
uniform vec2 uMaskUvScale;
uniform vec2 uMaskUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec3 cam = texture(uCamera, vUv).rgb;
  float raw = texture(uMask, vUv * uMaskUvScale + uMaskUvOffset).r;
  float a = clamp(smoothstep(uMaskLo, uMaskHi, raw), 0.0, 1.0);
  oColor = vec4(cam * a, a);
}
`;

type Uniform = number | readonly number[];

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('kaleidoscope: gl.createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no info log)';
    gl.deleteShader(shader);
    throw new Error(`kaleidoscope: scene shader compile failed: ${log}\n---\n${source}`);
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
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? '(no info log)';
    gl.deleteProgram(prog);
    throw new Error(`kaleidoscope: scene program link failed: ${log}`);
  }
  return prog;
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

const createTexture = (gl: WebGL2RenderingContext): WebGLTexture => {
  const tex = gl.createTexture();
  if (!tex) throw new Error('kaleidoscope: gl.createTexture returned null');
  gl.bindTexture(gl.TEXTURE_2D, tex);
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

// --- image loading (cached per source URL) ---------------------------------

type LoadedImage = { canvas: OffscreenCanvas; width: number; height: number };

const imageCache = new Map<string, Promise<LoadedImage>>();

const loadImage = (source: string): Promise<LoadedImage> => {
  const cached = imageCache.get(source);
  if (cached) return cached;
  const promise = (async (): Promise<LoadedImage> => {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`kaleidoscope: scene image fetch failed (${res.status}) for ${source}`);
    }
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    // Capture dimensions BEFORE close(): closing an ImageBitmap zeroes its
    // width/height, and reading them after produced a 0x0 size that made the
    // cover-fit UV scale NaN and smeared the texture.
    const width = bitmap.width;
    const height = bitmap.height;
    // Stage onto a 2D canvas so UNPACK_FLIP_Y_WEBGL applies on upload (it is a
    // no-op on ImageBitmap sources).
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('kaleidoscope: scene image 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { canvas, width, height };
  })();
  imageCache.set(source, promise);
  return promise;
};

// --- per-scene GL state (one scene active at a time) -----------------------

type ShaderLayerGpu = {
  prog: WebGLProgram;
  uTime: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uniforms: Map<string, WebGLUniformLocation | null>;
};

type SubjectGpu = {
  prog: WebGLProgram;
  uCamera: WebGLUniformLocation | null;
  uMask: WebGLUniformLocation | null;
  uMaskUvScale: WebGLUniformLocation | null;
  uMaskUvOffset: WebGLUniformLocation | null;
  uMaskLo: WebGLUniformLocation | null;
  uMaskHi: WebGLUniformLocation | null;
  cameraTex: WebGLTexture;
  maskTex: WebGLTexture;
};

type GpuState = {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  blit: {
    prog: WebGLProgram;
    uTex: WebGLUniformLocation | null;
    uCoverScale: WebGLUniformLocation | null;
  };
  imageTextures: Map<string, { tex: WebGLTexture; width: number; height: number }>;
  shaderPrograms: Map<string, ShaderLayerGpu>;
  subject: SubjectGpu | null;
  // Identity of the layer set this state was built for. Switching scenes at the
  // same resolution must rebuild (different shaders/targets, different programs).
  layersSig: string;
};

let state: GpuState | null = null;

const layersSignature = (layers: ReadonlyArray<LayerSpec>): string =>
  layers.map((l) => `${l.shader}:${l.target ?? 'background'}`).join('|');

const disposeState = (s: GpuState): void => {
  const { gl, blit, shaderPrograms, imageTextures, subject } = s;
  gl.deleteProgram(blit.prog);
  for (const p of shaderPrograms.values()) gl.deleteProgram(p.prog);
  for (const t of imageTextures.values()) gl.deleteTexture(t.tex);
  if (subject) {
    gl.deleteProgram(subject.prog);
    gl.deleteTexture(subject.cameraTex);
    gl.deleteTexture(subject.maskTex);
  }
};

// Camera frame staged here for both texture upload (flipY actually applies on a
// canvas source) and as the segmenter input.
let inputCanvas2D: OffscreenCanvas | null = null;
let inputCtx2D: OffscreenCanvasRenderingContext2D | null = null;

const ensureInputCanvas = (width: number, height: number): OffscreenCanvasRenderingContext2D => {
  if (!inputCanvas2D || inputCanvas2D.width !== width || inputCanvas2D.height !== height) {
    inputCanvas2D = new OffscreenCanvas(width, height);
    inputCtx2D = inputCanvas2D.getContext('2d');
    if (!inputCtx2D) throw new Error('kaleidoscope: scene input 2D context unavailable');
  }
  return inputCtx2D as OffscreenCanvasRenderingContext2D;
};

const ensureState = (width: number, height: number, layers: ReadonlyArray<LayerSpec>): GpuState => {
  const sig = layersSignature(layers);
  if (state && state.width === width && state.height === height && state.layersSig === sig) {
    return state;
  }
  const prevCanvas = state?.canvas;
  if (state) disposeState(state);
  const canvas = prevCanvas ?? new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('kaleidoscope: WebGL2 not available; scenes require a WebGL2 browser');

  const blitProg = linkProgram(gl, PASSTHROUGH_VERT_SRC, BLIT_FRAG_SRC);
  const shaderPrograms = new Map<string, ShaderLayerGpu>();
  for (const layer of layers) {
    // Only generative layers carry uniforms; 'image' and 'direct' do not.
    if (!('uniforms' in layer) || shaderPrograms.has(layer.shader)) continue;
    const src = LAYER_SHADER_SOURCES[layer.shader];
    if (!src) throw new Error(`kaleidoscope: unknown scene layer shader '${layer.shader}'`);
    const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, src);
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    for (const name of Object.keys(layer.uniforms)) {
      uniforms.set(name, gl.getUniformLocation(prog, name));
    }
    shaderPrograms.set(layer.shader, {
      prog,
      uTime: gl.getUniformLocation(prog, 'uTime'),
      uResolution: gl.getUniformLocation(prog, 'uResolution'),
      uniforms,
    });
  }

  let subject: SubjectGpu | null = null;
  if (layers.some((l) => l.target === 'subject')) {
    const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, SUBJECT_FRAG_SRC);
    subject = {
      prog,
      uCamera: gl.getUniformLocation(prog, 'uCamera'),
      uMask: gl.getUniformLocation(prog, 'uMask'),
      uMaskUvScale: gl.getUniformLocation(prog, 'uMaskUvScale'),
      uMaskUvOffset: gl.getUniformLocation(prog, 'uMaskUvOffset'),
      uMaskLo: gl.getUniformLocation(prog, 'uMaskLo'),
      uMaskHi: gl.getUniformLocation(prog, 'uMaskHi'),
      cameraTex: createTexture(gl),
      maskTex: createTexture(gl),
    };
  }

  state = {
    gl,
    canvas,
    width,
    height,
    blit: {
      prog: blitProg,
      uTex: gl.getUniformLocation(blitProg, 'uTex'),
      uCoverScale: gl.getUniformLocation(blitProg, 'uCoverScale'),
    },
    imageTextures: new Map(),
    shaderPrograms,
    subject,
    layersSig: sig,
  };
  return state;
};

const coverScale = (outW: number, outH: number, imgW: number, imgH: number): [number, number] => {
  const outAspect = outW / outH;
  const imgAspect = imgW / imgH;
  // Zoom in on the dimension that would otherwise letterbox (cover/center-crop).
  return outAspect > imgAspect ? [1, imgAspect / outAspect] : [outAspect / imgAspect, 1];
};

// Live tuning channel: per-shader-name uniform overrides the running compositor
// merges over a layer's baked uniforms each frame, with no pipeline rebuild
// (mirrors the mask() tuning). The demo's generated controls push here so a
// slider drag updates the scene smoothly. Keyed by shader name, so it applies to
// whichever scene is active that uses that shader.
type UniformMap = Readonly<Record<string, number | readonly number[]>>;
const layerUniformOverrides: Record<string, UniformMap> = {};

/** Override the uniforms of a layer shader (by name) in the running scene. */
export const setLayerUniforms = (shader: string, uniforms: UniformMap): void => {
  layerUniformOverrides[shader] = uniforms;
};

/** Drop a layer shader's override, reverting to the scene's baked uniforms. */
export const clearLayerUniforms = (shader: string): void => {
  delete layerUniformOverrides[shader];
};

export const makeScene = (layers: ReadonlyArray<LayerSpec>): FrameTransform => {
  const imageSources = layers.filter(
    (l): l is Extract<LayerSpec, { shader: 'image' }> => l.shader === 'image',
  );
  const needsSegmentation = layers.some((l) => l.target === 'subject');

  return async (frame) => {
    const w = frame.displayWidth;
    const h = frame.displayHeight;

    // Ensure all image layers are decoded before the first composite.
    const loaded = await Promise.all(imageSources.map((l) => loadImage(l.source)));
    if (needsSegmentation) await loadSegmenter();

    const s = ensureState(w, h, layers);
    const { gl, canvas, blit, imageTextures, shaderPrograms } = s;

    // Upload any image textures not yet on the GPU for this state.
    for (let i = 0; i < imageSources.length; i++) {
      const layer = imageSources[i];
      const img = loaded[i];
      if (!layer || !img) continue;
      const src = layer.source;
      if (imageTextures.has(src)) continue;
      const tex = createTexture(gl);
      uploadTexture(gl, tex, img.canvas as unknown as TexImageSource, true);
      imageTextures.set(src, { tex, width: img.width, height: img.height });
    }

    // Subject: stage the camera frame, kick segmentation, upload camera + mask.
    let subjectReady = false;
    if (needsSegmentation && s.subject) {
      const inputCtx = ensureInputCanvas(w, h);
      inputCtx.drawImage(frame, 0, 0, w, h);
      const inputSource = inputCanvas2D as unknown as CanvasImageSource;
      requestMaskIfIdle(inputSource);
      const results = getLatestMask();
      if (results) {
        uploadTexture(gl, s.subject.cameraTex, inputSource as unknown as TexImageSource, true);
        uploadTexture(
          gl,
          s.subject.maskTex,
          results.segmentationMask as unknown as TexImageSource,
          false,
        );
        subjectReady = true;
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    const now = performance.now() / 1000;

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer) continue;
      const target = layer.target ?? 'background';
      const isBase = i === 0;
      // Base layer is opaque; later layers blend by their mode.
      if (isBase || layer.blend == null || layer.blend === 'normal') {
        if (isBase) gl.disable(gl.BLEND);
        else {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied "over"
        }
      } else {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE); // premultiplied additive
      }

      if (layer.shader === 'image') {
        const img = imageTextures.get(layer.source);
        if (!img) continue;
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(blit.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, img.tex);
        gl.uniform1i(blit.uTex, 0);
        const [sx, sy] = coverScale(w, h, img.width, img.height);
        gl.uniform2f(blit.uCoverScale, sx, sy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else if (layer.shader === 'direct') {
        // Passthrough. On the subject that is the masked person; on the
        // background it is a no-op (nothing to pass through but the stack itself).
        if (target !== 'subject' || !s.subject || !subjectReady) continue;
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(s.subject.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, s.subject.cameraTex);
        gl.uniform1i(s.subject.uCamera, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, s.subject.maskTex);
        gl.uniform1i(s.subject.uMask, 1);
        // Web uploads the mask un-flipped and V-flips in the sampler (matches the
        // single-effect composite path).
        gl.uniform2f(s.subject.uMaskUvScale, 1, -1);
        gl.uniform2f(s.subject.uMaskUvOffset, 0, 1);
        const [maskLo, maskHi] = maskSmoothstepRange(tuning.maskHardness, tuning.maskThreshold);
        gl.uniform1f(s.subject.uMaskLo, maskLo);
        gl.uniform1f(s.subject.uMaskHi, maskHi);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        // A generative shader. Stenciling one to the subject (brightness,
        // redaction) is a later step; for now generative layers run on the
        // background.
        if (target === 'subject') continue;
        const prog = shaderPrograms.get(layer.shader);
        if (!prog) continue;
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(prog.prog);
        gl.uniform1f(prog.uTime, now);
        gl.uniform2f(prog.uResolution, w, h);
        const override = layerUniformOverrides[layer.shader];
        const merged = override ? { ...layer.uniforms, ...override } : layer.uniforms;
        for (const [name, value] of Object.entries(merged)) {
          bindUniform(gl, prog.uniforms.get(name) ?? null, value);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
      timestamp: frame.timestamp,
      ...(frame.duration != null ? { duration: frame.duration } : {}),
    });
    frame.close();
    return out;
  };
};
