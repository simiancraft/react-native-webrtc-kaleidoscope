// Web composite compositor: render a painter's stack of layers into one frame.
//
// This is the LAYERED path (distinct from the serial single-effect chain in
// index.web.ts). A composite is one stage: layer 0 is the opaque base, later layers
// blend over it in array order. Each layer is `{ shader, target?, blend? }`:
//   - shader 'image'  : a still texture (cover-fit), premultiplied.
//   - shader 'direct' : passthrough of its channel. On 'subject' that is the
//     masked camera person; on 'background' it is the raw camera fullscreen.
//   - shader 'blur'   : a camera-sampling separable gaussian (its `sigma` uniform).
//   - a generative shader (e.g. 'godrays') : render its frag with `uniforms`.
//   - target defaults to 'background' (fullscreen); 'subject' stencils to the mask.
//
// Two pixel sources: camera-sampling layers ('direct', 'blur') read the live
// frame; content-generating layers ('image', generative) make their own pixels.
// `target` decides the stencil for either: a 'background' layer draws fullscreen;
// a 'subject' layer is multiplied by the mask alpha so it shows only over the
// segmented person. Direct/subject takes a one-pass fast path (cam x mask); every
// other subject layer renders to a scratch texture and a masked-composite pass
// stencils it. The mask edge is the shared mask() tuning, so the demo sliders
// drive composites.

import type { LayerSpec } from '../../types';
import type { FrameTransform } from '../insertable-streams';
import { getLatestMask, loadSegmenter, requestMaskIfIdle } from '../segmenter';
import { PASSTHROUGH_VERT_SRC } from '../shaders';
import { maskSmoothstepRange, tuning } from '../tuning';
import { LAYER_SHADER_SOURCES } from './layer-shaders';

// Cover-fit blit: sample a texture (premultiplied) with a center-crop UV scale.
// Used for image layers and to draw a finished scratch (cover scale 1,1) to output.
const BLIT_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uCoverScale;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec2 uv = (vUv - 0.5) * uCoverScale + 0.5;
  vec4 c = texture(uTex, uv);
  oColor = vec4(c.rgb * c.a, c.a);
}
`;

// Raw camera fullscreen (direct/background), opaque.
const CAMERA_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uCamera;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  oColor = vec4(texture(uCamera, vUv).rgb, 1.0);
}
`;

// Direct/subject fast path: the masked camera person, output PREMULTIPLIED so a
// normal "over" blend composites the person onto the stack.
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

// Camera-sampling separable gaussian, 13-tap (base offsets -6..6, scaled by a
// sigma-coupled spread), sigma-weighted. One pass per direction (uDir is the
// texel step on the active axis); samples the camera or a half-blurred scratch;
// output keeps the source alpha (camera is opaque). Hand-maintained in lockstep
// with LayerShaders.BLUR_FRAG (Android) and composite-blur.metalsrc (iOS); the
// three are the same kernel and must stay identical.
const BLUR_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uSigma;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  float s2 = 2.0 * uSigma * uSigma;
  float w[7];
  float sum = 0.0;
  for (int i = 0; i < 7; i++) {
    w[i] = exp(-(float(i) * float(i)) / s2);
    sum += (i == 0) ? w[i] : 2.0 * w[i];
  }
  // Tap spacing scales with sigma (spread): the high end of the slider gains a
  // little extra reach plus a faint ghost/double-image instead of flatlining once
  // the 13-tap kernel saturates (~sigma 7). Intentional coupling; one knob drives
  // both blur softness and tap spacing, so this layer is a small multi-fx unit,
  // not a pure gaussian. Keep the spread term; do not split it back out. No floor,
  // so at low sigma the spread is sub-texel (taps overlap, near no-op); 0.25 keeps
  // it subtle over the 0..10 sigma slider (spread tops out at 2.5).
  float spread = uSigma * 0.25;
  vec4 acc = texture(uTex, vUv) * (w[0] / sum);
  for (int i = 1; i < 7; i++) {
    vec2 off = uDir * float(i) * spread;
    acc += texture(uTex, vUv + off) * (w[i] / sum);
    acc += texture(uTex, vUv - off) * (w[i] / sum);
  }
  oColor = acc;
}
`;

// Masked-composite: stencil a rendered layer (in uTex, treated as premultiplied)
// to the subject by multiplying through the mask alpha. Keeps the result
// premultiplied so the caller's "over"/"additive" blend composites it correctly.
const MASKED_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform vec2 uMaskUvScale;
uniform vec2 uMaskUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec4 c = texture(uTex, vUv);
  float raw = texture(uMask, vUv * uMaskUvScale + uMaskUvOffset).r;
  float a = clamp(smoothstep(uMaskLo, uMaskHi, raw), 0.0, 1.0);
  oColor = c * a;
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
    throw new Error(`kaleidoscope: composite shader compile failed: ${log}\n---\n${source}`);
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
    throw new Error(`kaleidoscope: composite program link failed: ${log}`);
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

type Fbo = { tex: WebGLTexture; fbo: WebGLFramebuffer };

// A render target sized to the frame: an RGBA texture with a framebuffer bound to
// it, for the blur ping-pong and the subject-stencil scratch.
const createFbo = (gl: WebGL2RenderingContext, width: number, height: number): Fbo => {
  const tex = createTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('kaleidoscope: gl.createFramebuffer returned null');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo };
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
      throw new Error(`kaleidoscope: composite image fetch failed (${res.status}) for ${source}`);
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
    if (!ctx) throw new Error('kaleidoscope: composite image 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { canvas, width, height };
  })();
  imageCache.set(source, promise);
  return promise;
};

// --- per-composite GL state (one composite active at a time) -----------------------

type ShaderLayerGpu = {
  prog: WebGLProgram;
  uTime: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uniforms: Map<string, WebGLUniformLocation | null>;
};

type CameraGpu = {
  prog: WebGLProgram;
  uCamera: WebGLUniformLocation | null;
  tex: WebGLTexture;
};

type DirectSubjectGpu = {
  prog: WebGLProgram;
  uCamera: WebGLUniformLocation | null;
  uMask: WebGLUniformLocation | null;
  uMaskUvScale: WebGLUniformLocation | null;
  uMaskUvOffset: WebGLUniformLocation | null;
  uMaskLo: WebGLUniformLocation | null;
  uMaskHi: WebGLUniformLocation | null;
};

type BlurGpu = {
  prog: WebGLProgram;
  uTex: WebGLUniformLocation | null;
  uDir: WebGLUniformLocation | null;
  uSigma: WebGLUniformLocation | null;
};

type MaskedGpu = {
  prog: WebGLProgram;
  uTex: WebGLUniformLocation | null;
  uMask: WebGLUniformLocation | null;
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
  blit: {
    prog: WebGLProgram;
    uTex: WebGLUniformLocation | null;
    uCoverScale: WebGLUniformLocation | null;
  };
  imageTextures: Map<string, { tex: WebGLTexture; width: number; height: number }>;
  shaderPrograms: Map<string, ShaderLayerGpu>;
  // Camera-sampling support: staged camera + its passthrough program. Present
  // when any 'direct' or 'blur' layer is in the stack.
  camera: CameraGpu | null;
  // The segmentation mask texture. Present when any layer targets the subject.
  maskTex: WebGLTexture | null;
  // direct/subject one-pass fast path (cam x mask).
  directSubject: DirectSubjectGpu | null;
  // Separable blur program. Present when any 'blur' layer is in the stack.
  blur: BlurGpu | null;
  // Masked-composite (stencil any rendered layer to the subject). Present when a
  // non-direct subject layer is in the stack.
  masked: MaskedGpu | null;
  // Scratch render targets: scratchA holds a layer's rendered content (and the
  // blur's horizontal pass); scratchB holds the blur's vertical pass.
  scratchA: Fbo | null;
  scratchB: Fbo | null;
  // Identity of the layer set this state was built for. Switching composites at the
  // same resolution must rebuild (different shaders/targets, different programs).
  layersSig: string;
};

let state: GpuState | null = null;

const layersSignature = (layers: ReadonlyArray<LayerSpec>): string =>
  layers.map((l) => `${l.id}:${l.shader}:${l.target ?? 'background'}`).join('|');

const disposeState = (s: GpuState): void => {
  const { gl } = s;
  gl.deleteProgram(s.blit.prog);
  for (const p of s.shaderPrograms.values()) gl.deleteProgram(p.prog);
  for (const t of s.imageTextures.values()) gl.deleteTexture(t.tex);
  if (s.camera) {
    gl.deleteProgram(s.camera.prog);
    gl.deleteTexture(s.camera.tex);
  }
  if (s.maskTex) gl.deleteTexture(s.maskTex);
  if (s.directSubject) gl.deleteProgram(s.directSubject.prog);
  if (s.blur) gl.deleteProgram(s.blur.prog);
  if (s.masked) gl.deleteProgram(s.masked.prog);
  for (const f of [s.scratchA, s.scratchB]) {
    if (f) {
      gl.deleteFramebuffer(f.fbo);
      gl.deleteTexture(f.tex);
    }
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
    if (!inputCtx2D) throw new Error('kaleidoscope: composite input 2D context unavailable');
  }
  return inputCtx2D as OffscreenCanvasRenderingContext2D;
};

const isCameraSampler = (shader: string): boolean => shader === 'direct' || shader === 'blur';

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
  if (!gl)
    throw new Error('kaleidoscope: WebGL2 not available; composites require a WebGL2 browser');

  const needsCamera = layers.some((l) => isCameraSampler(l.shader));
  const needsMask = layers.some((l) => l.target === 'subject');
  const hasDirectSubject = layers.some((l) => l.shader === 'direct' && l.target === 'subject');
  const hasGenericSubject = layers.some((l) => l.shader !== 'direct' && l.target === 'subject');
  const hasBlur = layers.some((l) => l.shader === 'blur');

  const blitProg = linkProgram(gl, PASSTHROUGH_VERT_SRC, BLIT_FRAG_SRC);

  const shaderPrograms = new Map<string, ShaderLayerGpu>();
  for (const layer of layers) {
    // Generative layers only: 'image'/'direct' carry no uniforms, and 'blur' has
    // a sigma uniform but is not a generative frag (it runs the blur program).
    if (!(layer.shader in LAYER_SHADER_SOURCES) || shaderPrograms.has(layer.shader)) continue;
    if (!('uniforms' in layer)) continue;
    const src = LAYER_SHADER_SOURCES[layer.shader];
    if (!src) throw new Error(`kaleidoscope: unknown composite layer shader '${layer.shader}'`);
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

  let camera: CameraGpu | null = null;
  if (needsCamera) {
    const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, CAMERA_FRAG_SRC);
    camera = { prog, uCamera: gl.getUniformLocation(prog, 'uCamera'), tex: createTexture(gl) };
  }

  const maskTex = needsMask ? createTexture(gl) : null;

  let directSubject: DirectSubjectGpu | null = null;
  if (hasDirectSubject) {
    const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, SUBJECT_FRAG_SRC);
    directSubject = {
      prog,
      uCamera: gl.getUniformLocation(prog, 'uCamera'),
      uMask: gl.getUniformLocation(prog, 'uMask'),
      uMaskUvScale: gl.getUniformLocation(prog, 'uMaskUvScale'),
      uMaskUvOffset: gl.getUniformLocation(prog, 'uMaskUvOffset'),
      uMaskLo: gl.getUniformLocation(prog, 'uMaskLo'),
      uMaskHi: gl.getUniformLocation(prog, 'uMaskHi'),
    };
  }

  let blur: BlurGpu | null = null;
  if (hasBlur) {
    const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, BLUR_FRAG_SRC);
    blur = {
      prog,
      uTex: gl.getUniformLocation(prog, 'uTex'),
      uDir: gl.getUniformLocation(prog, 'uDir'),
      uSigma: gl.getUniformLocation(prog, 'uSigma'),
    };
  }

  let masked: MaskedGpu | null = null;
  if (hasGenericSubject) {
    const prog = linkProgram(gl, PASSTHROUGH_VERT_SRC, MASKED_FRAG_SRC);
    masked = {
      prog,
      uTex: gl.getUniformLocation(prog, 'uTex'),
      uMask: gl.getUniformLocation(prog, 'uMask'),
      uMaskUvScale: gl.getUniformLocation(prog, 'uMaskUvScale'),
      uMaskUvOffset: gl.getUniformLocation(prog, 'uMaskUvOffset'),
      uMaskLo: gl.getUniformLocation(prog, 'uMaskLo'),
      uMaskHi: gl.getUniformLocation(prog, 'uMaskHi'),
    };
  }

  // scratchA: any subject layer that renders content, or the blur horizontal
  // pass. scratchB: the blur vertical pass result.
  const scratchA = hasGenericSubject || hasBlur ? createFbo(gl, width, height) : null;
  const scratchB = hasBlur ? createFbo(gl, width, height) : null;

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
    camera,
    maskTex,
    directSubject,
    blur,
    masked,
    scratchA,
    scratchB,
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

// Live tuning channel: per-layer-id uniform overrides the running compositor
// merges over a layer's baked uniforms each frame, with no pipeline rebuild
// (mirrors the mask() tuning). The kaleidoscope verb pushes here so a slider drag
// updates the composite smoothly. Keyed by layer id (unique within a composite), so a
// patch addresses exactly one layer even when two layers share a shader.
//
// These are INTERNAL: the kaleidoscope verb absorbs them (controls.ts injects
// setLayerUniforms via the web facade). They are not part of the public surface,
// but stay exported so the facade and controls can drive them.
type UniformMap = Readonly<Record<string, number | readonly number[]>>;
const layerUniformOverrides: Record<string, UniformMap> = {};

/** Override a layer's uniforms (by layer id) in the running composite; merges. */
export const setLayerUniforms = (id: string, uniforms: UniformMap): void => {
  layerUniformOverrides[id] = { ...layerUniformOverrides[id], ...uniforms };
};

/** Drop a layer's override (by layer id), reverting to its baked uniforms. */
const clearLayerUniforms = (id: string): void => {
  delete layerUniformOverrides[id];
};

/**
 * Drop EVERY layer override. A preset switch calls this so a reused layer id
 * (e.g. 'blur', shared by the low/medium/high blur presets) reverts to the new
 * preset's baked uniforms instead of carrying a stale slider override across.
 */
export const resetLayerUniforms = (): void => {
  for (const id of Object.keys(layerUniformOverrides)) delete layerUniformOverrides[id];
};

const mergedUniforms = (layer: Extract<LayerSpec, { uniforms: UniformMap }>): UniformMap => {
  const override = layerUniformOverrides[layer.id];
  return override ? { ...layer.uniforms, ...override } : layer.uniforms;
};

export const makeComposite = (layers: ReadonlyArray<LayerSpec>): FrameTransform => {
  // A preset switch builds a fresh composite; drop any live overrides whose layer id
  // is not in this stack so a reused id (e.g. 'you') can't carry a stale override
  // from the previous preset into this one.
  const ids = new Set(layers.map((l) => l.id));
  for (const id of Object.keys(layerUniformOverrides)) {
    if (!ids.has(id)) clearLayerUniforms(id);
  }
  const imageSources = layers.filter(
    (l): l is Extract<LayerSpec, { shader: 'image' }> => l.shader === 'image',
  );
  const needsSegmentation = layers.some((l) => l.target === 'subject');
  const needsCamera = layers.some((l) => isCameraSampler(l.shader));

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

    // Stage the camera frame: needed for any camera-sampling layer and as the
    // segmenter input. Upload to the shared camera texture; kick segmentation and
    // upload the mask when a subject layer is present.
    let subjectReady = false;
    if (needsCamera || needsSegmentation) {
      const inputCtx = ensureInputCanvas(w, h);
      inputCtx.drawImage(frame, 0, 0, w, h);
      const inputSource = inputCanvas2D as unknown as CanvasImageSource;
      if (needsCamera && s.camera) {
        uploadTexture(gl, s.camera.tex, inputSource as unknown as TexImageSource, true);
      }
      if (needsSegmentation && s.maskTex) {
        requestMaskIfIdle(inputSource);
        const results = getLatestMask();
        if (results) {
          uploadTexture(
            gl,
            s.maskTex,
            results.segmentationMask as unknown as TexImageSource,
            false,
          );
          subjectReady = true;
        }
      }
    }

    const now = performance.now() / 1000;
    const [maskLo, maskHi] = maskSmoothstepRange(tuning.maskHardness, tuning.maskThreshold);

    // Bind a mask sampler on texture unit 1 for the subject programs (V-flipped in
    // the sampler, matching the single-effect composite path).
    const bindMask = (
      uMask: WebGLUniformLocation | null,
      uScale: WebGLUniformLocation | null,
      uOffset: WebGLUniformLocation | null,
      uLo: WebGLUniformLocation | null,
      uHi: WebGLUniformLocation | null,
    ): void => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
      gl.uniform1i(uMask, 1);
      gl.uniform2f(uScale, 1, -1);
      gl.uniform2f(uOffset, 0, 1);
      gl.uniform1f(uLo, maskLo);
      gl.uniform1f(uHi, maskHi);
    };

    const drawQuad = (): void => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Render a layer's content into scratchA (blend off, cleared), returning the
    // texture that holds it. Blur is special: it runs the separable passes
    // (camera -> scratchA -> scratchB) and returns scratchB.
    const renderContentToScratch = (layer: LayerSpec): WebGLTexture | null => {
      gl.disable(gl.BLEND);
      if (layer.shader === 'blur') {
        if (!s.blur || !s.camera || !s.scratchA || !s.scratchB) return null;
        // Read through mergedUniforms so a live slider edit (setLayerUniforms)
        // reaches the blur pass, exactly like the generative layers below.
        const sigmaVal = mergedUniforms(layer).sigma;
        const sigma = typeof sigmaVal === 'number' ? sigmaVal : 4;
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(s.blur.prog);
        gl.uniform1f(s.blur.uSigma, sigma);
        // Horizontal pass: camera -> scratchA.
        gl.bindFramebuffer(gl.FRAMEBUFFER, s.scratchA.fbo);
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, s.camera.tex);
        gl.uniform1i(s.blur.uTex, 0);
        gl.uniform2f(s.blur.uDir, 1 / w, 0);
        drawQuad();
        // Vertical pass: scratchA -> scratchB.
        gl.bindFramebuffer(gl.FRAMEBUFFER, s.scratchB.fbo);
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, s.scratchA.tex);
        gl.uniform1i(s.blur.uTex, 0);
        gl.uniform2f(s.blur.uDir, 0, 1 / h);
        drawQuad();
        return s.scratchB.tex;
      }
      if (!s.scratchA) return null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.scratchA.fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (layer.shader === 'image') {
        const img = imageTextures.get(layer.source);
        if (!img) return null;
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(blit.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, img.tex);
        gl.uniform1i(blit.uTex, 0);
        const [sx, sy] = coverScale(w, h, img.width, img.height);
        gl.uniform2f(blit.uCoverScale, sx, sy);
        drawQuad();
        return s.scratchA.tex;
      }
      // Generative.
      const prog = shaderPrograms.get(layer.shader);
      if (!prog || !('uniforms' in layer)) return null;
      // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
      gl.useProgram(prog.prog);
      gl.uniform1f(prog.uTime, now);
      gl.uniform2f(prog.uResolution, w, h);
      for (const [name, value] of Object.entries(mergedUniforms(layer))) {
        bindUniform(gl, prog.uniforms.get(name) ?? null, value);
      }
      drawQuad();
      return s.scratchA.tex;
    };

    gl.disable(gl.DEPTH_TEST);

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer) continue;
      const target = layer.target ?? 'background';
      const isBase = i === 0;

      const setOutputBlend = (): void => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        if (isBase) {
          gl.disable(gl.BLEND);
        } else if (layer.blend === 'additive') {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE); // premultiplied additive
        } else {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied "over"
        }
      };

      if (target === 'subject') {
        // Subject layers need the mask; skip until it warms up.
        if (!s.maskTex || !subjectReady) continue;
        if (layer.shader === 'direct') {
          // One-pass fast path: cam x mask.
          if (!s.directSubject || !s.camera) continue;
          setOutputBlend();
          // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
          gl.useProgram(s.directSubject.prog);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, s.camera.tex);
          gl.uniform1i(s.directSubject.uCamera, 0);
          bindMask(
            s.directSubject.uMask,
            s.directSubject.uMaskUvScale,
            s.directSubject.uMaskUvOffset,
            s.directSubject.uMaskLo,
            s.directSubject.uMaskHi,
          );
          drawQuad();
        } else {
          // Render the layer content to a scratch, then stencil it through the mask.
          if (!s.masked) continue;
          const contentTex = renderContentToScratch(layer);
          if (!contentTex) continue;
          setOutputBlend();
          // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
          gl.useProgram(s.masked.prog);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, contentTex);
          gl.uniform1i(s.masked.uTex, 0);
          bindMask(
            s.masked.uMask,
            s.masked.uMaskUvScale,
            s.masked.uMaskUvOffset,
            s.masked.uMaskLo,
            s.masked.uMaskHi,
          );
          drawQuad();
        }
        continue;
      }

      // Background layers draw fullscreen.
      if (layer.shader === 'image') {
        const img = imageTextures.get(layer.source);
        if (!img) continue;
        setOutputBlend();
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(blit.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, img.tex);
        gl.uniform1i(blit.uTex, 0);
        const [sx, sy] = coverScale(w, h, img.width, img.height);
        gl.uniform2f(blit.uCoverScale, sx, sy);
        drawQuad();
      } else if (layer.shader === 'direct') {
        // Raw camera fullscreen.
        if (!s.camera) continue;
        setOutputBlend();
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(s.camera.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, s.camera.tex);
        gl.uniform1i(s.camera.uCamera, 0);
        drawQuad();
      } else if (layer.shader === 'blur') {
        const contentTex = renderContentToScratch(layer);
        if (!contentTex) continue;
        setOutputBlend();
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(blit.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, contentTex);
        gl.uniform1i(blit.uTex, 0);
        gl.uniform2f(blit.uCoverScale, 1, 1);
        drawQuad();
      } else {
        // Generative background.
        const prog = shaderPrograms.get(layer.shader);
        if (!prog || !('uniforms' in layer)) continue;
        setOutputBlend();
        // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is a WebGL call, not a React hook.
        gl.useProgram(prog.prog);
        gl.uniform1f(prog.uTime, now);
        gl.uniform2f(prog.uResolution, w, h);
        for (const [name, value] of Object.entries(mergedUniforms(layer))) {
          bindUniform(gl, prog.uniforms.get(name) ?? null, value);
        }
        drawQuad();
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
