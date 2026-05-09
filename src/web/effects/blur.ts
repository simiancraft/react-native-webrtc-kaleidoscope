// Web blur effect. Loads MediaPipe Selfie Segmentation from CDN on first call
// (the npm copy ships a self-decorating IIFE that doesn't bundle the WASM/data
// files, so a CDN script tag is the path of least resistance), runs the model
// on each frame, and composites the original (person) over a blurred copy
// (background) using the segmentation mask.
//
// Composite pattern (mask-as-alpha): drawImage(mask) → source-in original →
// destination-over blurred. See the MediaPipe docs for the canonical demo.

import type { FrameTransform } from '../insertable-streams';

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation';
const BLUR_RADIUS_PX = 15;

// Minimal type for the global SelfieSegmentation surface we use here.
// (The npm package's index.d.ts declares the same shape but the runtime is
// loaded via CDN, not imported, so we keep a local structural type.)
type SegmenterResults = {
  image: CanvasImageSource;
  segmentationMask: CanvasImageSource;
};
type SegmenterOptions = { selfieMode?: boolean; modelSelection?: number };
type Segmenter = {
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

const loadSegmenter = (): Promise<Segmenter> => {
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

let inputCanvas: OffscreenCanvas | null = null;
let inputCtx: OffscreenCanvasRenderingContext2D | null = null;
let outputCanvas: OffscreenCanvas | null = null;
let outputCtx: OffscreenCanvasRenderingContext2D | null = null;

const ensureBuffers = (
  width: number,
  height: number,
): { input: OffscreenCanvasRenderingContext2D; output: OffscreenCanvasRenderingContext2D } => {
  if (!inputCanvas || inputCanvas.width !== width || inputCanvas.height !== height) {
    inputCanvas = new OffscreenCanvas(width, height);
    inputCtx = inputCanvas.getContext('2d');
    outputCanvas = new OffscreenCanvas(width, height);
    outputCtx = outputCanvas.getContext('2d');
    if (!inputCtx || !outputCtx) {
      throw new Error('kaleidoscope: OffscreenCanvas 2D context unavailable');
    }
  }
  return {
    input: inputCtx as OffscreenCanvasRenderingContext2D,
    output: outputCtx as OffscreenCanvasRenderingContext2D,
  };
};

export const blur: FrameTransform = async (frame) => {
  const segmenter = await loadSegmenter();
  const w = frame.displayWidth;
  const h = frame.displayHeight;
  const { input, output } = ensureBuffers(w, h);

  // Stage the incoming VideoFrame on a canvas (MediaPipe accepts a canvas as input).
  input.drawImage(frame, 0, 0, w, h);

  // Bridge MediaPipe's onResults (callback) into a promise scoped to this frame.
  const results: SegmenterResults = await new Promise((resolve) => {
    segmenter.onResults((r) => resolve(r));
    void segmenter.send({ image: inputCanvas as unknown as HTMLCanvasElement });
  });

  // Composite: paint mask alpha → fill mask area with original → fill remainder with blur.
  output.save();
  output.clearRect(0, 0, w, h);

  output.globalCompositeOperation = 'source-over';
  output.drawImage(results.segmentationMask, 0, 0, w, h);

  output.globalCompositeOperation = 'source-in';
  output.drawImage(inputCanvas as unknown as CanvasImageSource, 0, 0, w, h);

  output.globalCompositeOperation = 'destination-over';
  output.filter = `blur(${BLUR_RADIUS_PX}px)`;
  output.drawImage(inputCanvas as unknown as CanvasImageSource, 0, 0, w, h);
  output.filter = 'none';

  output.restore();
  output.globalCompositeOperation = 'source-over';

  const out = new VideoFrame(outputCanvas as unknown as CanvasImageSource, {
    timestamp: frame.timestamp,
    ...(frame.duration != null ? { duration: frame.duration } : {}),
  });
  frame.close();
  return out;
};
