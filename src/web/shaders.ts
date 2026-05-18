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

// Composite for the blur effect: mix(blurred, original, mask). The mask
// comes in as a 4-channel texture from MediaPipe; we read the red channel.
//
// MediaPipe's segmentationMask is Y-flipped relative to the camera frame,
// and UNPACK_FLIP_Y_WEBGL has no visible effect at upload time. Flip V
// here so the mask aligns with the original. (The Android side does NOT
// have this flip; see android/.../gpu/Shaders.kt for why.)
//
// uMaskLo / uMaskHi parameterize the smoothstep transition over the raw
// confidence map; the caller derives them from a hardness factor via
// `maskHardnessRange` in src/web/tuning.ts.
export const COMPOSITE_BLUR_FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uOriginal;
uniform sampler2D uBlurred;
uniform sampler2D uMask;
uniform float uMaskLo;
uniform float uMaskHi;
in vec2 vUv;
out vec4 oColor;
void main() {
  float raw = texture(uMask, vec2(vUv.x, 1.0 - vUv.y)).r;
  float m = smoothstep(uMaskLo, uMaskHi, raw);
  vec3 orig = texture(uOriginal, vUv).rgb;
  vec3 blur = texture(uBlurred, vUv).rgb;
  oColor = vec4(mix(blur, orig, m), 1.0);
}
`;

// Composite for the background-image effect: mix(background, original, mask).
// Both mask and background are V-flipped because MediaPipe's mask is
// Y-flipped and ImageBitmaps created from fetched PNGs arrive in DOM
// coordinates (top-left origin) that GL samples upside-down.
export const COMPOSITE_BG_FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uOriginal;
uniform sampler2D uBackground;
uniform sampler2D uMask;
uniform float uMaskLo;
uniform float uMaskHi;
in vec2 vUv;
out vec4 oColor;
void main() {
  vec2 flipped = vec2(vUv.x, 1.0 - vUv.y);
  float raw = texture(uMask, flipped).r;
  float m = smoothstep(uMaskLo, uMaskHi, raw);
  vec3 orig = texture(uOriginal, vUv).rgb;
  vec3 bg = texture(uBackground, flipped).rgb;
  oColor = vec4(mix(bg, orig, m), 1.0);
}
`;
