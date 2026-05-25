// Pure 9-tap separable Gaussian kernel math. Extracted so it is unit-testable
// in isolation (no WebGL/DOM imports) and shared by the web blur effect.
//
// Mirrors Android's BlurFactory.ensureKernel exactly so web, Android, and iOS
// run the identical blur.frag: tap spacing 2.0, weight = exp(-x^2 / 2σ^2),
// normalized by (w0 + 2·Σ w[1..]) because the shader samples vUv ± offset and
// adds each side tap twice. Given a sigma it returns fresh arrays; the caller
// caches by sigma (the kernel only changes when the blur slider moves).

export const KERNEL_TAPS = 5;

// Linear-sampled separable Gaussian. A dense Gaussian over texels 0..8 is
// collapsed into 5 entries: the center plus 4 bilinear pairs of adjacent
// texels (1,2), (3,4), (5,6), (7,8). Each pair becomes one fractional-offset
// fetch whose bilinear blend reproduces the two texels' weighted sum, so the
// shader issues 9 fetches per pass instead of 17. offsets[0] is the center
// (0). Normalized so center + 2*Σ(pairs) == 1 (the shader samples vUv ±
// offset and adds each side). Mirrors Android BlurFactory.ensureKernel and iOS
// BlurKernel.ensure exactly.
export const computeBlurKernel = (
  sigma: number,
): { weights: Float32Array; offsets: Float32Array } => {
  const g = (t: number): number => Math.exp(-(t * t) / (2 * sigma * sigma));
  const offsets = new Float32Array(KERNEL_TAPS);
  const raw = new Array<number>(KERNEL_TAPS);
  offsets[0] = 0;
  raw[0] = g(0);
  let sum = raw[0];
  for (let p = 1; p < KERNEL_TAPS; p++) {
    const a = 2 * p - 1;
    const b = 2 * p;
    const wa = g(a);
    const wb = g(b);
    const w = wa + wb;
    offsets[p] = (a * wa + b * wb) / w;
    raw[p] = w;
    sum += 2 * w;
  }
  const weights = new Float32Array(KERNEL_TAPS);
  for (let i = 0; i < KERNEL_TAPS; i++) {
    weights[i] = (raw[i] ?? 0) / sum;
  }
  return { weights, offsets };
};
