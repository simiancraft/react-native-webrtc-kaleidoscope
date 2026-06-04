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

/**
 * A running Insertable-Streams stage. `track` is the generator track carrying
 * transformed frames; `dispose` aborts the pipe and stops the generator so the
 * stage can be torn down (e.g. on a LiveKit camera flip) without leaking the
 * generator and its pull on the source track.
 */
export type DisposablePipeline = {
  track: MediaStreamTrack;
  dispose: () => void;
};

export const applyEffectToTrack = (
  track: MediaStreamTrack,
  transform: FrameTransform,
): DisposablePipeline => {
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

  // Abort signal lets `dispose()` cancel the pipe: aborting cancels the
  // readable (which stops the processor pulling from the source) and errors the
  // writable, ending the generator.
  const abort = new AbortController();
  processor.readable
    .pipeThrough(transformer)
    .pipeTo(generator.writable, { signal: abort.signal })
    .catch((err) => {
      // Pipeline aborts when the source track ends, is replaced, or dispose()
      // is called; not an error.
      if (err?.name !== 'AbortError') {
        console.error('kaleidoscope: pipeline error', err);
      }
    });

  const dispose = (): void => {
    try {
      abort.abort();
    } catch {
      // already aborted
    }
    try {
      generator.stop();
    } catch {
      // already stopped
    }
  };

  return { track: generator, dispose };
};
