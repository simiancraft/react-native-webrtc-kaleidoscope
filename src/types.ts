/**
 * Built-in effect names shipped in v0.1.
 *
 * `mirror` — pixel-exact horizontal flip; no ML.
 * `blur`   — person segmentation + Gaussian background blur.
 *            Backends: Apple Vision (iOS), MLKit (Android), MediaPipe WASM (web).
 */
export type EffectName = 'mirror' | 'blur';

/**
 * Apply zero or more named effects to a local `MediaStreamTrack`.
 *
 * - Native: thin facade over `track._setVideoEffects(names)` from
 *   `react-native-webrtc`. Returns the same track reference; mutation is in place.
 * - Web: builds an Insertable-Streams pipeline with `MediaStreamTrackProcessor`
 *   and `MediaStreamTrackGenerator` and returns a NEW track carrying the
 *   transformed frames. Replace the upstream sender's track with the return value
 *   (`sender.replaceTrack(returnedTrack)`) to apply effects to a peer connection,
 *   or attach it to a `<video>` element for local preview.
 *
 * Throws on remote tracks, unknown effect names, missing platform capabilities
 * (web: Insertable Streams; native: peer-dep `_setVideoEffects`), or non-video
 * tracks.
 */
export type ApplyVideoEffects = (track: MediaStreamTrack, names: EffectName[]) => MediaStreamTrack;
