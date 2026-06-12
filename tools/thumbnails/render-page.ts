// The thumbnail maker's render page (issue #65): a self-contained HTML
// document that composites one preset's non-subject layer stack and encodes a
// 320x180 WebP, all in-browser (the browser's own encoder; no native image
// deps). The CLI drives it per preset via `window.renderPreset(spec)`.
//
// Rendering model (mirrors the web compositor's semantics at thumbnail scale):
//   - shader layers draw on a WebGL2 canvas (the generated single-source
//     frags, exact preset uniforms over control defaults, fixed mid-animation
//     uTime so output is deterministic and past initialization);
//   - image layers cover-fit onto the 2D compositing canvas;
//   - blur layers run the real composite-blur two-pass over the bundled
//     "virtual scene" office fixture (the camera stand-in);
//   - `additive` blend maps to canvas 'lighter', everything else paints over.
//
// Render happens at 2x (640x360) and downscales to 320x180 for antialiasing.
// Encoding sweeps WebP quality from low to high and keeps the first level
// whose decode round-trips within an RMSE gate against the uncompressed
// canvas: smallest file with no visible artifacting.

export type PageLayerSpec =
  | {
      readonly kind: 'shader';
      readonly name: string;
      readonly uniforms: Record<string, number | readonly number[]>;
      readonly blend?: string;
    }
  | { readonly kind: 'image'; readonly dataUrl: string; readonly blend?: string }
  | { readonly kind: 'blur'; readonly sigma: number; readonly blend?: string };

export type PagePresetSpec = {
  readonly id: string;
  readonly layers: readonly PageLayerSpec[];
};

export type PageResult = {
  readonly dataUrl: string;
  readonly q: number;
  readonly bytes: number;
  readonly rmse: number;
};

const FULLSCREEN_VERT = `#version 300 es
out highp vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function generatePage(opts: {
  readonly shaderSources: Readonly<Record<string, string>>;
  readonly blurFragSrc: string;
  readonly fixtureDataUrl: string;
}): string {
  const data = JSON.stringify({
    vert: FULLSCREEN_VERT,
    sources: opts.shaderSources,
    blurSrc: opts.blurFragSrc,
    fixture: opts.fixtureDataUrl,
  });
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>kaleidoscope thumbnails</title></head>
<body>
<script>
const DATA = ${data};
const W = 640, H = 360, TW = 320, TH = 180;
// Fixed mid-animation clock: deterministic, and well past t=0 initialization.
const T = 7.0;
// RMSE gate (0..255 scale) for "no visible artifacting" on a 320x180 thumb.
const RMSE_MAX = 2.6;
const QUALITIES = [0.5, 0.6, 0.68, 0.76, 0.84, 0.92];

const glc = document.createElement('canvas');
glc.width = W; glc.height = H;
const gl = glc.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });

const progCache = {};
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader compile: ' + (gl.getShaderInfoLog(s) || '?'));
  }
  return s;
}
function program(key, fragSrc) {
  if (progCache[key]) return progCache[key];
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, DATA.vert));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link ' + key + ': ' + (gl.getProgramInfoLog(p) || '?'));
  }
  progCache[key] = p;
  return p;
}

function setUniform(p, name, v) {
  const loc = gl.getUniformLocation(p, name) || gl.getUniformLocation(p, name + '[0]');
  if (!loc) return;
  if (typeof v === 'number') { gl.uniform1f(loc, v); return; }
  if (!Array.isArray(v)) return;
  if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
  else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
  else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
  else gl.uniform2fv(loc, new Float32Array(v)); // a flat vec2[] (polygon)
}
function setUniforms(p, uniforms, w, h) {
  gl.useProgram(p);
  setUniform(p, 'uTime', T);
  setUniform(p, 'uResolution', [w, h]);
  for (const k in uniforms) setUniform(p, k, uniforms[k]);
}

function renderShader(name, uniforms) {
  const src = DATA.sources[name];
  if (!src) throw new Error('no shader source registered for "' + name + '"');
  const p = program(name, src);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  setUniforms(p, uniforms, W, H);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function imgToTexture(img) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
function makeFbo(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

let fixtureImgP = null;
function fixtureImg() {
  if (!fixtureImgP) fixtureImgP = loadImg(DATA.fixture);
  return fixtureImgP;
}
function loadImg(url) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image failed to load'));
    i.src = url;
  });
}

// The real composite-blur, both separable passes, over the camera stand-in.
async function renderBlur(sigma) {
  const img = await fixtureImg();
  const srcTex = imgToTexture(img);
  const pass = makeFbo(W, H);
  const p = program('composite-blur', DATA.blurSrc);
  gl.activeTexture(gl.TEXTURE0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fbo);
  gl.viewport(0, 0, W, H);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.useProgram(p);
  setUniform(p, 'uTex', 0);
  const texLoc = gl.getUniformLocation(p, 'uTex');
  if (texLoc) gl.uniform1i(texLoc, 0);
  setUniform(p, 'uSigma', sigma);
  setUniform(p, 'uDir', [1 / W, 0]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.bindTexture(gl.TEXTURE_2D, pass.tex);
  if (texLoc) gl.uniform1i(texLoc, 0);
  setUniform(p, 'uSigma', sigma);
  setUniform(p, 'uDir', [0, 1 / H]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function coverDraw(ctx, img, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

async function rmseAgainst(ref, dataUrl) {
  const img = await loadImg(dataUrl);
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const got = x.getImageData(0, 0, TW, TH).data;
  let sum = 0, n = 0;
  for (let i = 0; i < got.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const d = got[i + ch] - ref.data[i + ch];
      sum += d * d; n++;
    }
  }
  return Math.sqrt(sum / n);
}

window.renderPreset = async (spec) => {
  const comp = document.createElement('canvas');
  comp.width = W; comp.height = H;
  const ctx = comp.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  for (const layer of spec.layers) {
    ctx.globalCompositeOperation = layer.blend === 'additive' ? 'lighter' : 'source-over';
    if (layer.kind === 'image') {
      coverDraw(ctx, await loadImg(layer.dataUrl), W, H);
    } else if (layer.kind === 'blur') {
      await renderBlur(layer.sigma);
      ctx.drawImage(glc, 0, 0, W, H);
    } else {
      renderShader(layer.name, layer.uniforms);
      ctx.drawImage(glc, 0, 0, W, H);
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  const tc = document.createElement('canvas');
  tc.width = TW; tc.height = TH;
  const tctx = tc.getContext('2d');
  tctx.drawImage(comp, 0, 0, TW, TH);
  const ref = tctx.getImageData(0, 0, TW, TH);

  for (const q of QUALITIES) {
    const url = tc.toDataURL('image/webp', q);
    const rmse = await rmseAgainst(ref, url);
    if (rmse <= RMSE_MAX) {
      return { dataUrl: url, q, bytes: Math.round((url.length - 'data:image/webp;base64,'.length) * 0.75), rmse };
    }
  }
  // Noisy content (dot lattices, starfields, confetti) never satisfies an
  // RMSE gate; the per-pixel error is invisible dither. Cap at the sweep's
  // top quality instead of escalating further.
  const url = tc.toDataURL('image/webp', 0.92);
  const rmse = await rmseAgainst(ref, url);
  return { dataUrl: url, q: 0.92, bytes: Math.round((url.length - 'data:image/webp;base64,'.length) * 0.75), rmse };
};
</script>
</body></html>`;
}
