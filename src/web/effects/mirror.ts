// Web mirror effect. Draws the incoming VideoFrame to an OffscreenCanvas with
// a horizontal scale flip, then encodes the canvas as a new VideoFrame
// preserving timestamp and duration.

import type { FrameTransform } from '../insertable-streams';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

const ensureCanvas = (width: number, height: number): OffscreenCanvasRenderingContext2D => {
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('kaleidoscope: OffscreenCanvas 2D context unavailable');
    }
  }
  return ctx as OffscreenCanvasRenderingContext2D;
};

export const mirror: FrameTransform = async (frame) => {
  const w = frame.displayWidth;
  const h = frame.displayHeight;
  const c = ensureCanvas(w, h);

  c.save();
  c.setTransform(-1, 0, 0, 1, w, 0);
  c.drawImage(frame, 0, 0, w, h);
  c.restore();

  const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
    timestamp: frame.timestamp,
    ...(frame.duration != null ? { duration: frame.duration } : {}),
  });
  frame.close();
  return out;
};
