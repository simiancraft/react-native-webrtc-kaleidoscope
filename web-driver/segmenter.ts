// MediaPipe Selfie Segmentation loader. Single shared instance across every
// web effect that needs a person mask (blur, a subject-masked layer, future
// procedural backgrounds). The script is loaded once from a CDN; the
// segmenter instance is cached for the lifetime of the page.
//
// CDN-loaded rather than bundled because @mediapipe/selfie_segmentation
// ships a WASM blob and asset graph that does not play nicely with Metro;
// we listed the npm package as an optionalDependency for typing only.

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation';

export type SegmenterResults = {
  image: CanvasImageSource;
  segmentationMask: CanvasImageSource;
};

type SegmenterOptions = { selfieMode?: boolean; modelSelection?: number };

export type Segmenter = {
  initialize(): Promise<void>;
  setOptions(opts: SegmenterOptions): void;
  onResults(cb: (r: SegmenterResults) => void): void;
  send(input: { image: CanvasImageSource }): Promise<void>;
  close(): Promise<void>;
};

type SegmenterCtor = new (config: { locateFile: (file: string) => string }) => Segmenter;

let segmenterPromise: Promise<Segmenter> | null = null;

// Decoupled mask source (mirrors Android Mask.kt / iOS Segmenter.swift): the
// render path reads the most recent mask without ever awaiting a fresh one, and
// a single in-flight segmentation refreshes it. `onResults` is registered once,
// at load, below.
let latestResults: SegmenterResults | null = null;
let inFlight = false;
let activeSegmenter: Segmenter | null = null;

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

export const loadSegmenter = (): Promise<Segmenter> => {
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
    // Register once; every completed segmentation updates the cache.
    seg.onResults((r) => {
      latestResults = r;
    });
    activeSegmenter = seg;
    return seg;
  })();
  return segmenterPromise;
};

/** Most recent completed mask, or null before the first result. Non-blocking. */
export const getLatestMask = (): SegmenterResults | null => latestResults;

/**
 * Kick a new segmentation if none is in flight; returns immediately. The result
 * lands in `getLatestMask()` via the `onResults` handler registered at load.
 * No-op until the segmenter has finished loading. `inFlight` clears when `send`
 * settles, so a failed call cannot wedge the pipeline.
 */
export const requestMaskIfIdle = (image: CanvasImageSource): void => {
  const seg = activeSegmenter;
  if (!seg || inFlight) return;
  inFlight = true;
  seg
    .send({ image })
    .catch(() => {})
    .finally(() => {
      inFlight = false;
    });
};
