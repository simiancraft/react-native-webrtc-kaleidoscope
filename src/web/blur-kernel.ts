// Pure 9-tap separable Gaussian kernel math. Extracted so it is unit-testable
// in isolation (no WebGL/DOM imports) and shared by the web blur effect.
//
// Mirrors Android's BlurFactory.ensureKernel exactly so web, Android, and iOS
// run the identical blur.frag: tap spacing 2.0, weight = exp(-x^2 / 2σ^2),
// normalized by (w0 + 2·Σ w[1..]) because the shader samples vUv ± offset and
// adds each side tap twice. Given a sigma it returns fresh arrays; the caller
// caches by sigma (the kernel only changes when the blur slider moves).

export const KERNEL_TAPS = 9;
const TAP_SPACING = 2;

export const computeBlurKernel = (
  sigma: number,
): { weights: Float32Array; offsets: Float32Array } => {
  const offsets = new Float32Array(KERNEL_TAPS);
  const raw = new Array<number>(KERNEL_TAPS);
  let sum = 0;
  for (let i = 0; i < KERNEL_TAPS; i++) {
    const x = i * TAP_SPACING;
    const wi = Math.exp(-(x * x) / (2 * sigma * sigma));
    offsets[i] = x;
    raw[i] = wi;
    sum += i === 0 ? wi : 2 * wi;
  }
  const weights = new Float32Array(KERNEL_TAPS);
  for (let i = 0; i < KERNEL_TAPS; i++) {
    weights[i] = (raw[i] ?? 0) / sum;
  }
  return { weights, offsets };
};
