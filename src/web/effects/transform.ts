// Web transform effects: pure geometric reorientations of the frame (axis
// flips and 90-degree rotations). Each draws the incoming VideoFrame to an
// OffscreenCanvas with the matching 2D transform, then re-encodes the canvas as
// a new VideoFrame preserving timestamp and duration.
//
// On web the frame is already in display space, so a flip on the canvas X axis
// is a flip on the screen's horizontal axis with no rotation correction. These
// are therefore the platform-reference behavior for the demo's calibration
// toggles; the native pipelines have to correct for the landscape camera
// buffer's rotation to land on the same on-screen result.
//
// makeTransform closes over its own canvas (one per pipeline stage) so two
// stacked transform stages never fight over a shared scratch buffer.

import type { TransformName } from '../../kaleidoscope/effect.types';
import type { FrameTransform } from '../insertable-streams';

export const makeTransform = (op: TransformName): FrameTransform => {
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

  return async (frame) => {
    const w = frame.displayWidth;
    const h = frame.displayHeight;
    // 90-degree rotations swap the output dimensions.
    const rotated = op === 'rotate-cw' || op === 'rotate-ccw';
    const c = ensureCanvas(rotated ? h : w, rotated ? w : h);

    c.save();
    switch (op) {
      case 'flip-x':
        // Mirror about the vertical centerline: x -> w - x.
        c.setTransform(-1, 0, 0, 1, w, 0);
        break;
      case 'flip-y':
        // Mirror about the horizontal centerline: y -> h - y.
        c.setTransform(1, 0, 0, -1, 0, h);
        break;
      case 'rotate-cw':
        // 90 deg clockwise into the h x w canvas.
        c.setTransform(0, 1, -1, 0, h, 0);
        break;
      case 'rotate-ccw':
        // 90 deg counter-clockwise into the h x w canvas.
        c.setTransform(0, -1, 1, 0, 0, w);
        break;
    }
    c.drawImage(frame, 0, 0, w, h);
    c.restore();

    const out = new VideoFrame(canvas as unknown as CanvasImageSource, {
      timestamp: frame.timestamp,
      ...(frame.duration != null ? { duration: frame.duration } : {}),
    });
    frame.close();
    return out;
  };
};
