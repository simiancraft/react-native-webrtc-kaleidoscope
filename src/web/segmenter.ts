// MediaPipe Selfie Segmentation loader. Single shared instance across every
// web effect that needs a person mask (blur, background-image, future
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
    return seg;
  })();
  return segmenterPromise;
};
