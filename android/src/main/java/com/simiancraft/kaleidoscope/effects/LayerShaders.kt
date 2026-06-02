// Layer-shader GLSL for the native composite compositor, embedded as Kotlin string
// constants. These mirror the canonical `shaders/<name>.frag` and their verbatim
// web copies in `src/web/effects/layer-shaders.ts`. The generic shader codegen
// (`build:shaders`) only emits the GENERATIVE background channel today; layer
// shaders (the additive/overlay/background stack the compositor composites) are a
// distinct path, so they live here until the codegen grows a layer path. Keep
// each in sync with its `shaders/<name>.frag`.
//
// All are GLSL ES 3.00 (`#version 300 es`), matching the native GL context
// (see GlProgram / ShadersGenerated). Each generative layer takes `uTime`
// (seconds) and `uResolution` (vec2 px) plus its u-prefixed uniforms; output is
// premultiplied where the layer is meant to blend "over" (image, subject) or to
// emit straight RGB with alpha 1 where it is an opaque base (clouds, plasma,
// nebula, simianlights). Overlay layers (godrays, fireflies, anamorphic) emit
// premultiplied RGBA and are composited additively.

package com.simiancraft.kaleidoscope.effects

internal object LayerShaders {
  // ---- compositor-local layer programs (image + subject), ported from composite.ts -

  // Cover-fit a still texture, output PREMULTIPLIED so a straight-alpha image
  // (a transparent sky / cut-out opening) composites correctly with the "over"
  // blend: transparent regions show the stack beneath. uCoverScale zooms the UV
  // about center to crop-fit (mirrors BLIT_FRAG_SRC in composite.ts). No V-flip in
  // the shader: the image bitmap is pre-flipped on upload (matches
  // BackgroundImageFactory), so the texture already lands semantic-top at v=1.
  const val IMAGE_FRAG = """#version 300 es
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
"""

  // The masked camera person, output PREMULTIPLIED (rgb already scaled by the
  // mask alpha) so a "normal" over-blend composites the person onto the stack.
  // Mirrors SUBJECT_FRAG_SRC in composite.ts. uMaskUvScale/uMaskUvOffset carry the
  // mask orientation: on Android the mask round-trip (glReadPixels bottom-up +
  // Bitmap top-down + packMask flip-back) leaves the mask aligned with the
  // camera FBO, so these are identity (1,1)/(0,0) here, unlike web's (1,-1)/(0,1).
  const val SUBJECT_FRAG = """#version 300 es
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
  float safeHi = max(uMaskHi, uMaskLo + 0.001);
  float a = clamp(smoothstep(uMaskLo, safeHi, raw), 0.0, 1.0);
  oColor = vec4(cam * a, a);
}
"""

  // CAMERA layer migrated to the single-source pipeline; see
  // Shaders.COMPOSITE_CAMERA_FRAG (canonical shaders/_shared/composite-camera.frag).

  // Camera-sampling separable gaussian, 13-tap (base offsets -6..6, scaled by a
  // sigma-coupled spread), sigma-weighted. Hand-written to mirror BLUR_FRAG_SRC in
  // composite.ts (NOT the codegen'd Shaders.BLUR_FRAG, which is the downscaled
  // bilinear kernel of the old BlurFactory). One pass per direction (uDir is the
  // texel step on the active axis): horizontal camera -> scratch, then vertical
  // scratch -> scratch. Output keeps the source alpha (the camera FBO is opaque).
  // Keep identical to the web and iOS copies.
  const val BLUR_FRAG = """#version 300 es
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
  // Tap spacing scales with sigma (spread): adds reach plus a faint double-image
  // at the high end instead of flatlining once the kernel saturates. Intentional
  // coupling (blur softness AND tap spacing on one knob); a small multi-fx unit,
  // not a pure gaussian. Keep the spread term.
  float spread = uSigma * 0.25;
  vec4 acc = texture(uTex, vUv) * (w[0] / sum);
  for (int i = 1; i < 7; i++) {
    vec2 off = uDir * float(i) * spread;
    acc += texture(uTex, vUv + off) * (w[i] / sum);
    acc += texture(uTex, vUv - off) * (w[i] / sum);
  }
  oColor = acc;
}
"""

  // Masked-composite: stencil a rendered scratch layer (uTex, treated as
  // premultiplied) to the subject by multiplying through the mask alpha. Keeps the
  // result premultiplied so the caller's "over"/"additive" blend composites it
  // correctly. Mirrors MASKED_FRAG_SRC in composite.ts; identity mask UV on Android
  // (the readback already aligns it), unlike web's (1,-1)/(0,1).
  const val MASKED_FRAG = """#version 300 es
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
  float safeHi = max(uMaskHi, uMaskLo + 0.001);
  float a = clamp(smoothstep(uMaskLo, safeHi, raw), 0.0, 1.0);
  oColor = c * a;
}
"""

  // ---- generative layer fragments (mirror layer-shaders.ts) ------------------

  const val GODRAYS_FRAG = """#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uLightColor;
uniform float uRayCount;
uniform float uRaySpeed;
uniform float uRayIntensity;
uniform float uRaySoftness;
uniform float uTopGlow;
uniform float uFadeDistance;
uniform float uWobbleAmount;
uniform float uWobbleSpeed;

in highp vec2 vUv;
out vec4 oColor;

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i.x + i.y * 57.0);
    float b = hash(i.x + 1.0 + i.y * 57.0);
    float c = hash(i.x + (i.y + 1.0) * 57.0);
    float d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 p = uv;
    p.x = (p.x - 0.5) * aspect + 0.5;
    float t = uTime;
    float fromTop = 1.0 - uv.y;
    float verticalFade = exp(-fromTop * uFadeDistance);
    float topGlow = exp(-fromTop * 8.0) * uTopGlow;
    float wobble = (noise(vec2(uv.y * 3.0, t * uWobbleSpeed)) - 0.5) * uWobbleAmount;
    float rayCoord = (p.x + wobble) * uRayCount;
    float raysA = sin(rayCoord + t * uRaySpeed);
    float raysB = sin(rayCoord * 1.73 - t * uRaySpeed * 0.7);
    float rays = raysA * 0.65 + raysB * 0.35;
    rays = rays * 0.5 + 0.5;
    rays = pow(rays, uRaySoftness);
    float shimmer = noise(vec2(uv.x * 10.0, uv.y * 4.0 - t * 0.3));
    rays *= mix(0.75, 1.25, shimmer);
    float alpha = rays * verticalFade * uRayIntensity;
    alpha += topGlow * uRayIntensity;
    alpha = clamp(alpha, 0.0, 1.0);
    vec3 rayColor = uLightColor * alpha;
    oColor = vec4(rayColor, alpha);
}
"""

  const val CLOUDS_FRAG = """#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uSkyLowColor;
uniform vec3 uSkyHighColor;
uniform vec3 uCloudLightColor;
uniform vec3 uCloudDarkColor;
uniform float uExposure;
uniform float uStepSize;
uniform float uCloudSpeed;
uniform float uCloudScale;
uniform float uDensity;
uniform float uCoverage;
uniform float uSoftness;

in highp vec2 vUv;
out vec4 oColor;

// STEPS must stay a compile-time constant (GLSL ES loop bound).
#define STEPS 64

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float rand(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(
            mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
            f.y),
        mix(
            mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
            f.y),
        f.z);
}

float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

float cloudDensity(vec3 p) {
    p += vec3(uTime * uCloudSpeed, 0.0, uTime * uCloudSpeed * 0.35);
    float n = fbm(p * uCloudScale);
    float bottom = smoothstep(0.0, 0.7, p.y);
    float top = smoothstep(3.0, 1.2, p.y);
    float heightMask = bottom * top;
    float cloud = smoothstep(uCoverage, uCoverage + uSoftness, n);
    return cloud * heightMask;
}

void main() {
    vec2 fragCoord = vUv * uResolution;
    vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
    vec3 ro = vec3(0.0, 1.2, -4.0);
    vec3 rd = normalize(vec3(uv, 1.5));
    float skyGradient = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 skyColor = mix(uSkyLowColor, uSkyHighColor, skyGradient);
    vec3 accum = vec3(0.0);
    float alpha = 0.0;
    float t = rand(fragCoord) * uStepSize;
    for (int i = 0; i < STEPS; i++) {
        vec3 p = ro + rd * t;
        float d = cloudDensity(p);
        if (d > 0.01) {
            float light = smoothstep(0.4, 2.8, p.y);
            vec3 sampleColor = mix(uCloudDarkColor, uCloudLightColor, light);
            float a = d * uDensity;
            accum += (1.0 - alpha) * sampleColor * a;
            alpha += (1.0 - alpha) * a;
        }
        t += uStepSize;
        if (alpha > 0.95) break;
    }
    vec3 color = mix(skyColor, accum, alpha);
    color *= uExposure;
    color = pow(color, vec3(0.9));
    oColor = vec4(color, 1.0);
}
"""

  const val FIREFLIES_FRAG = """#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uGlowSize;
uniform float uDotSize;
uniform float uSpeed;
uniform float uTwinkle;

in highp vec2 vUv;
out vec4 oColor;

#define FIREFLY_COUNT 36

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

vec2 fireflyPos(float id, float t) {
    vec2 base = vec2(hash(id * 12.7), hash(id * 31.3));
    float a = hash(id * 5.1) * 6.28318;
    float b = hash(id * 9.7) * 6.28318;
    vec2 drift = vec2(sin(t * uSpeed + a), cos(t * uSpeed * 0.73 + b)) * 0.12;
    return fract(base + drift);
}

void main() {
    vec2 uv = vUv;
    vec2 p = uv;
    p.x *= uResolution.x / uResolution.y;
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    for (int i = 0; i < FIREFLY_COUNT; i++) {
        float id = float(i);
        vec2 pos = fireflyPos(id, uTime);
        pos.x *= uResolution.x / uResolution.y;
        float d = length(p - pos);
        float phase = hash(id * 17.1) * 6.28318;
        float pulse = 0.5 + 0.5 * sin(uTime * uTwinkle + phase);
        pulse = pow(pulse, 2.5);
        float glow = exp(-d * d / (uGlowSize * uGlowSize));
        float core = smoothstep(uDotSize, 0.0, d);
        float intensity = pulse * (glow * 0.55 + core * 1.4);
        vec3 fireflyColor = vec3(1.0, 0.82, 0.32);
        color += fireflyColor * intensity;
        alpha += intensity * 0.55;
    }
    alpha = clamp(alpha, 0.0, 1.0);
    color = clamp(color, 0.0, 1.0);
    oColor = vec4(color, alpha);
}
"""

  const val NEBULA_FRAG = """#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform float uBrightness;
uniform float uSpeed;
uniform float uTwinkleSpeed;
uniform float uScale;
uniform float uStarGlow;

in highp vec2 vUv;
out vec4 oColor;

const float PI = 3.14159265;
const float MIN_DIVIDE = 64.0;
const float MAX_DIVIDE = 0.01;
const int STARFIELD_LAYERS_COUNT = 12;

mat2 Rotate(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float Star(vec2 uv, float flaresize, float rotAngle, float randomN) {
  float d = length(uv);
  float starcore = 0.05 * uStarGlow / max(d, 1e-4);
  uv *= Rotate(-2.0 * PI * rotAngle);
  float flareMax = 1.0;
  float starflares = max(0.0, flareMax - abs(uv.x * uv.y * 3000.0));
  starcore += starflares * flaresize;
  uv *= Rotate(PI * 0.25);
  starflares = max(0.0, flareMax - abs(uv.x * uv.y * 3000.0));
  starcore += starflares * 0.3 * flaresize;
  starcore *= smoothstep(1.0, 0.05, d);
  return starcore;
}

float PseudoRandomizer(vec2 p) {
  p = fract(p * vec2(123.45, 345.67));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 StarFieldLayer(vec2 uv, float rotAngle) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  float deltaTimeTwinkle = uTime * 0.35 * uTwinkleSpeed;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      float randomN = PseudoRandomizer(id + offset);
      float randoX = randomN - 0.5;
      float randoY = fract(randomN * 45.0) - 0.5;
      vec2 randomPosition = gv - offset - vec2(randoX, randoY);
      float size = fract(randomN * 1356.33);
      float flareSwitch = smoothstep(0.9, 1.0, size);
      float star = Star(randomPosition, flareSwitch, rotAngle, randomN);
      float randomStarColorSeed = fract(randomN * 2150.0) * (3.0 * PI) * deltaTimeTwinkle;
      vec3 color = sin(vec3(0.7, 0.3, 0.9) * randomStarColorSeed);
      color = color * (0.4 * sin(deltaTimeTwinkle)) + 0.6;
      color = color * vec3(1.0, 0.1, 0.9 + size);
      float dimByDensity = 15.0 / float(STARFIELD_LAYERS_COUNT);
      col += star * size * color * dimByDensity;
    }
  }
  return col;
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord - 0.5 * uResolution.xy) / uResolution.y;
  float deltaTime = uTime * 0.01 * uSpeed;
  vec3 col = vec3(0.0);
  float rotAngle = deltaTime * 0.09;
  for (int n = 0; n < STARFIELD_LAYERS_COUNT; n++) {
    float i = float(n) / float(STARFIELD_LAYERS_COUNT);
    float layerDepth = fract(i + deltaTime);
    float layerScale = mix(MIN_DIVIDE, MAX_DIVIDE, layerDepth);
    float layerFader = layerDepth * smoothstep(0.1, 1.1, layerDepth);
    float layerOffset = i * (3430.0 + fract(i));
    mat2 layerRot = Rotate(rotAngle * i * -10.0);
    uv *= layerRot;
    vec2 starfieldUv = uv * layerScale * uScale + layerOffset;
    col += StarFieldLayer(starfieldUv, rotAngle) * layerFader;
  }
  col *= uBrightness * uColor;
  oColor = vec4(col, 1.0);
}
"""

  const val SIMIANLIGHTS_FRAG = """#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform float uBrightness;
uniform float uSpeed;
uniform float uTwinkleSpeed;
uniform float uScale;
uniform float uStarGlow;

in highp vec2 vUv;
out vec4 oColor;

const float PI = 3.14159265;
const float MIN_DIVIDE = 3.0;
const float MAX_DIVIDE = 0.01;
const int STARFIELD_LAYERS_COUNT = 4;

mat2 Rotate(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float Star(vec2 uv, float flaresize, float rotAngle, float randomN) {
  float d = length(uv);
  float starcore = 0.09 * uStarGlow / max(d, 1e-4);
  uv *= Rotate(-2.0 * PI * rotAngle);
  float flareMax = 1.0;
  float starflares = max(0.0, flareMax - abs(uv.x * uv.y * 3000.0));
  starcore += starflares * flaresize;
  uv *= Rotate(PI * 0.25);
  starflares = max(0.0, flareMax - abs(uv.x * uv.y * 3000.0));
  starcore += starflares * 0.3 * flaresize;
  starcore *= smoothstep(1.0, 0.05, d);
  return starcore;
}

float PseudoRandomizer(vec2 p) {
  p = fract(p * vec2(123.45, 345.67));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 StarFieldLayer(vec2 uv, float rotAngle) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  float deltaTimeTwinkle = uTime * 0.35 * uTwinkleSpeed;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      float randomN = PseudoRandomizer(id + offset);
      float randoX = randomN - 0.5;
      float randoY = fract(randomN * 45.0) - 0.5;
      vec2 randomPosition = gv - offset - vec2(randoX, randoY);
      float size = fract(randomN * 1356.33);
      float flareSwitch = smoothstep(0.9, 1.0, size);
      float star = Star(randomPosition, flareSwitch, rotAngle, randomN);
      float randomStarColorSeed = fract(randomN * 2150.0) * (3.0 * PI) * deltaTimeTwinkle;
      vec3 color = sin(vec3(0.7, 0.3, 0.9) * randomStarColorSeed);
      color = color * (0.4 * sin(deltaTimeTwinkle)) + 0.6;
      color = color * vec3(1.0, 0.1, 0.9 + size);
      float dimByDensity = 15.0 / float(STARFIELD_LAYERS_COUNT);
      col += star * size * color * dimByDensity;
    }
  }
  return col;
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord - 0.5 * uResolution.xy) / uResolution.y;
  float deltaTime = uTime * 0.01 * uSpeed;
  vec3 col = vec3(0.0);
  float rotAngle = deltaTime * 0.09;
  for (int n = 0; n < STARFIELD_LAYERS_COUNT; n++) {
    float i = float(n) / float(STARFIELD_LAYERS_COUNT);
    float layerDepth = fract(i + deltaTime);
    float layerScale = mix(MIN_DIVIDE, MAX_DIVIDE, layerDepth);
    float layerFader = layerDepth * smoothstep(0.1, 1.1, layerDepth);
    float layerOffset = i * (3430.0 + fract(i));
    mat2 layerRot = Rotate(rotAngle * i * -10.0);
    uv *= layerRot;
    vec2 starfieldUv = uv * layerScale * uScale + layerOffset;
    col += StarFieldLayer(starfieldUv, rotAngle) * layerFader;
  }
  col *= uBrightness * uColor;
  oColor = vec4(col, 1.0);
}
"""

  const val ANAMORPHIC_LENSFLARE_FRAG = """#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uFlareX;
uniform float uFlareY;
uniform float uIntensity;
uniform float uStreakLength;
uniform float uStreakWidth;
uniform float uGhostStrength;
uniform vec3 uWarmColor;
uniform vec3 uBlueColor;
uniform vec3 uPinkColor;

in highp vec2 vUv;
out vec4 oColor;

float softOrb(vec2 uv, vec2 center, float radius) {
  float d = length(uv - center);
  return exp(-pow(d / radius, 2.0));
}

float softStreak(vec2 uv, vec2 center, float width, float length) {
  float yFalloff = exp(-abs(uv.y - center.y) * width);
  float xFalloff = exp(-abs(uv.x - center.x) * length);
  return yFalloff * xFalloff;
}

void main() {
  vec2 uv = vUv;
  float horizontalDrift = sin(uTime * 0.18) * 0.10;
  vec2 flarePos = vec2(uFlareX + horizontalDrift, uFlareY);
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  float core = softOrb(uv, flarePos, 0.022);
  float bloom = softOrb(uv, flarePos, 0.095);
  float outerHalo = softOrb(uv, flarePos, 0.28);
  col += vec3(1.0) * core * 1.8;
  col += uWarmColor * bloom * 0.95;
  col += uBlueColor * outerHalo * 0.16;
  alpha += core * 0.45;
  alpha += bloom * 0.22;
  alpha += outerHalo * 0.045;

  float sweepGlow = 0.85 + 0.15 * sin(uTime * 0.7 + uv.x * 8.0);
  float mainStreak = softStreak(uv, flarePos, uStreakWidth, uStreakLength);
  float wideStreak = softStreak(uv, flarePos, 70.0, uStreakLength * 0.65);
  col += uWarmColor * mainStreak * 1.15 * sweepGlow;
  col += uBlueColor * wideStreak * 0.26 * sweepGlow;
  alpha += mainStreak * 0.18;
  alpha += wideStreak * 0.055;

  float upperLine = softStreak(uv, flarePos + vec2(0.0, 0.012), 260.0, uStreakLength * 0.7);
  float lowerLine = softStreak(uv, flarePos - vec2(0.0, 0.010), 240.0, uStreakLength * 0.8);
  col += uBlueColor * upperLine * 0.22;
  col += uPinkColor * lowerLine * 0.16;
  alpha += (upperLine + lowerLine) * 0.035;

  vec2 center = vec2(0.5);
  vec2 axis = center - flarePos;
  vec2 ghost1 = flarePos + axis * 0.45;
  vec2 ghost2 = flarePos + axis * 0.85;
  vec2 ghost3 = flarePos + axis * 1.28;
  vec2 ghost4 = flarePos - axis * 0.35;
  float g1 = softOrb(uv, ghost1, 0.070);
  float g2 = softOrb(uv, ghost2, 0.115);
  float g3 = softOrb(uv, ghost3, 0.055);
  float g4 = softOrb(uv, ghost4, 0.095);
  col += uPinkColor * g1 * 0.18 * uGhostStrength;
  col += uBlueColor * g2 * 0.15 * uGhostStrength;
  col += uWarmColor * g3 * 0.22 * uGhostStrength;
  col += uBlueColor * g4 * 0.10 * uGhostStrength;
  alpha += g1 * 0.040 * uGhostStrength;
  alpha += g2 * 0.035 * uGhostStrength;
  alpha += g3 * 0.050 * uGhostStrength;
  alpha += g4 * 0.030 * uGhostStrength;

  float shimmer = 0.97 + 0.03 * sin(uTime * 2.1);
  col *= uIntensity * shimmer;
  alpha *= uIntensity * shimmer;
  alpha = clamp(alpha, 0.0, 1.0);
  oColor = vec4(col, alpha);
}
"""

  // Plasma reuses the codegen'd GENERATIVE source so the one canonical plasma
  // body stays single-sourced (ShadersGenerated.PLASMA_FRAG).
  val GENERATIVE: Map<String, String> = mapOf(
    "godrays" to GODRAYS_FRAG,
    "clouds" to CLOUDS_FRAG,
    "fireflies" to FIREFLIES_FRAG,
    "nebula" to NEBULA_FRAG,
    "simianlights" to SIMIANLIGHTS_FRAG,
    "anamorphic-lensflare" to ANAMORPHIC_LENSFLARE_FRAG,
    "plasma" to com.simiancraft.kaleidoscope.gpu.ShadersGenerated.PLASMA_FRAG,
  )
}
