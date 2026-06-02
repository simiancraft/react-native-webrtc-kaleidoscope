// Opt-in LiveKit adapter, exported from the `react-native-webrtc-kaleidoscope/livekit`
// subpath. It wraps the web Insertable-Streams pipeline in LiveKit's
// TrackProcessor interface so consumers do not have to hand-write the glue.
//
// Why this exists: the core web API is `applyVideoEffects(track) -> newTrack`,
// which assumes the caller owns the RTCRtpSender and calls replaceTrack itself.
// LiveKit owns the sender, so consumers go through `track.setProcessor(...)`
// instead. This adapter is that bridge:
//
//   import { KaleidoscopeProcessor } from 'react-native-webrtc-kaleidoscope/livekit';
//   await localVideoTrack.setProcessor(
//     new KaleidoscopeProcessor([{ name: 'composite', layers: [{ id: 'you', shader: 'direct', target: 'subject' }] }]),
//   );
//
// `livekit-client` is an OPTIONAL peer dependency: the import below is type-only
// (erased at build), so the published JS has no runtime dependency on LiveKit
// and the agnostic core stays decoupled. Only consumers that import this subpath
// need livekit-client installed (they already have it).
//
// This adapter is web-only: it builds on MediaStreamTrackProcessor /
// MediaStreamTrackGenerator (Insertable Streams), which exist in Chromium-based
// browsers. On unsupported environments the underlying pipeline throws a typed
// error at init().

import type { ProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import { applyVideoEffectsDisposable } from './index.web';
import type { EffectInput } from './types';

/**
 * A LiveKit `TrackProcessor` that applies Kaleidoscope video effects to a local
 * camera track. Construct it with the same effect inputs `applyVideoEffects`
 * accepts (bare transform names like `'flip-x'`, or full `EffectSpec` composite
 * objects), then pass it to `localTrack.setProcessor(processor)`.
 *
 * `restart` (camera flip / source change) and `destroy` (unpublish) tear down
 * the prior Insertable-Streams pipeline, so repeated flips do not leak
 * generators. The page-shared segmenter and WebGL state are module singletons
 * reused across pipelines, so they are intentionally retained.
 */
export class KaleidoscopeProcessor implements TrackProcessor<Track.Kind.Video> {
  readonly name = 'kaleidoscope';
  processedTrack?: MediaStreamTrack;

  private readonly effects: ReadonlyArray<EffectInput>;
  private disposePipeline: (() => void) | null = null;

  constructor(effects: ReadonlyArray<EffectInput>) {
    this.effects = effects;
  }

  async init(opts: ProcessorOptions<Track.Kind.Video>): Promise<void> {
    const { track, dispose } = applyVideoEffectsDisposable(opts.track, this.effects);
    this.processedTrack = track;
    this.disposePipeline = dispose;
  }

  async restart(opts: ProcessorOptions<Track.Kind.Video>): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    this.disposePipeline?.();
    this.disposePipeline = null;
    this.processedTrack = undefined;
  }
}
