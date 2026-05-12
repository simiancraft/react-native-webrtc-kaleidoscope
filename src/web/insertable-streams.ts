// Insertable-Streams pipeline factory. Wires
//   MediaStreamTrackProcessor → TransformStream(transform) → MediaStreamTrackGenerator
// and returns the generator track. Caller hands the new track to a `<video>`
// element for preview, or to `RTCRtpSender.replaceTrack(...)` for a peer connection.
//
// Spec: https://www.w3.org/TR/mediacapture-transform/
// Browsers: Chrome / Edge ship it. Safari and Firefox do not as of 2026-05;
// we capability-check at call time and throw a typed error.

export type FrameTransform = (frame: VideoFrame) => Promise<VideoFrame>;

// Insertable-Streams APIs are not yet in TypeScript's lib.dom.d.ts.
// Local ambient declarations until they land upstream.
declare global {
  interface MediaStreamTrackProcessorInit {
    track: MediaStreamTrack;
    maxBufferSize?: number;
  }
  interface MediaStreamTrackProcessor {
    readonly readable: ReadableStream<VideoFrame>;
  }
  var MediaStreamTrackProcessor: {
    prototype: MediaStreamTrackProcessor;
    new (init: MediaStreamTrackProcessorInit): MediaStreamTrackProcessor;
  };

  interface MediaStreamTrackGeneratorInit {
    kind: 'video' | 'audio';
  }
  interface MediaStreamTrackGenerator extends MediaStreamTrack {
    readonly writable: WritableStream<VideoFrame>;
  }
  var MediaStreamTrackGenerator: {
    prototype: MediaStreamTrackGenerator;
    new (init: MediaStreamTrackGeneratorInit): MediaStreamTrackGenerator;
  };
}

const hasInsertableStreams = (): boolean =>
  typeof globalThis.MediaStreamTrackProcessor !== 'undefined' &&
  typeof globalThis.MediaStreamTrackGenerator !== 'undefined';

export const applyEffectToTrack = (
  track: MediaStreamTrack,
  transform: FrameTransform,
): MediaStreamTrack => {
  if (!hasInsertableStreams()) {
    throw new Error(
      'kaleidoscope: this browser lacks MediaStreamTrackProcessor / MediaStreamTrackGenerator (Insertable Streams). Effects require Chrome or Edge.',
    );
  }

  const processor = new MediaStreamTrackProcessor({ track });
  const generator = new MediaStreamTrackGenerator({ kind: 'video' });

  const transformer = new TransformStream<VideoFrame, VideoFrame>({
    async transform(frame, controller) {
      try {
        const out = await transform(frame);
        controller.enqueue(out);
      } catch (err) {
        try {
          frame.close();
        } catch {
          // already closed
        }
        controller.error(err);
      }
    },
  });

  // Fire-and-forget; pipeline lifetime is bound to the source track.
  processor.readable
    .pipeThrough(transformer)
    .pipeTo(generator.writable)
    .catch((err) => {
      // Pipeline aborts when the source track ends or is replaced; not an error.
      if (err?.name !== 'AbortError') {
        console.error('kaleidoscope: pipeline error', err);
      }
    });

  return generator;
};
