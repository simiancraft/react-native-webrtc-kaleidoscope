// GLSL ES 3.00 source for every web effect's WebGL2 pipeline. Single file so
// "where do I add a new shader on web" has one answer.
//
// Shapes mirror android/.../gpu/Shaders.kt. They are not yet bit-identical
// because the Android side runs on GLES external textures (OES sampler;
// camera buffer arrives transformed) and the web side runs on 2D textures
// (the upstream MediaStreamTrackProcessor already hands us decoded 2D
// frames). The shared structure is: passthrough vertex shader, separable
// 1D Gaussian fragment shader, composite-with-mask fragment shader. Keep
// the math in sync manually for now; extracting to shared .frag files with
// a Metro transformer is a v0.2 conversation.

// Procedural full-screen quad via gl_VertexID; no VAO or VBO required.
// Caller does: gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4).
export const PASSTHROUGH_VERT_SRC = `#version 300 es
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
export const BLUR_FRAG_SRC = `#version 300 es
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

// Composite: mix(background, original, mask). One shader, byte-identical
// to android/.../gpu/Shaders.kt's COMPOSITE_FRAG so the same canonical
// GLSL source serves both platforms (and post-transpile, iOS Metal).
//
// Texture-orientation convention: every input texture lands with its
// semantic "top of source image" at GL v=1. Each platform's host code
// picks the upload flags or pre-flip to achieve this:
//   - Web original / mask / bg: UNPACK_FLIP_Y_WEBGL=true on upload.
//   - Android original: OES->2D pass with transformMatrix lands head at v=1.
//   - Android mask: the readback round-trip (glReadPixels bottom-up plus
//     Bitmap top-down plus GLUtils.texImage2D preserving rows) cancels out.
//   - Android bg: Bitmap pre-flip via Matrix(preScale(1, -1)) before
//     GLUtils.texImage2D, because Android OpenGL ES has no flipY flag.
// With that convention enforced upstream, the composite samples every
// texture at vUv directly. No V-flips at sample time.
//
// uBackground is whatever you bind to it: a blurred copy, a sampled PNG,
// or a procedural shader's output. uBgUvScale / uBgUvOffset perform a
// cover-fit center crop when the background's aspect ratio differs from
// the output; the caller computes them from aspect ratios. For a
// full-size background (blur output), pass (1, 1) and (0, 0).
//
// uMaskLo / uMaskHi parameterize the smoothstep transition over the raw
// confidence map; the caller derives them from a hardness factor via
// `maskHardnessRange` in src/web/tuning.ts (mirrors MaskTuning.smoothstepRange
// on Android).
export const COMPOSITE_FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uOriginal;
uniform sampler2D uBackground;
uniform sampler2D uMask;
uniform vec2 uBgUvScale;
uniform vec2 uBgUvOffset;
uniform float uMaskLo;
uniform float uMaskHi;
in vec2 vUv;
out vec4 oColor;
void main() {
  float raw = texture(uMask, vUv).r;
  float m = smoothstep(uMaskLo, uMaskHi, raw);
  vec3 orig = texture(uOriginal, vUv).rgb;
  vec2 bgUv = vUv * uBgUvScale + uBgUvOffset;
  vec3 bg = texture(uBackground, bgUv).rgb;
  oColor = vec4(mix(bg, orig, m), 1.0);
}
`;
