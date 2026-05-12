// Single demo screen. Renders local camera feed and toggles for mirror / blur.

import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { applyVideoEffects, type EffectName } from 'react-native-webrtc-kaleidoscope';
import { EffectToggles } from '../src/effect-toggles';
import { useLoopbackStream } from '../src/use-loopback-stream';
import { VideoPreview } from '../src/video-preview';

const EFFECT_ORDER: ReadonlyArray<EffectName> = ['mirror', 'blur'];

export default function DemoScreen() {
  const stream = useLoopbackStream();
  const [active, setActive] = useState<ReadonlySet<EffectName>>(new Set());

  const sourceTrack = useMemo<MediaStreamTrack | null>(() => {
    if (stream.status !== 'ready') return null;
    return stream.stream.getVideoTracks()[0] ?? null;
  }, [stream]);

  // Re-derive the displayed track when the source or the active set changes.
  const displayedTrack = useMemo<MediaStreamTrack | null>(() => {
    if (!sourceTrack) return null;
    const names = EFFECT_ORDER.filter((n) => active.has(n));
    if (names.length === 0) return sourceTrack;
    try {
      return applyVideoEffects(sourceTrack, names);
    } catch (err) {
      console.error(err);
      return sourceTrack;
    }
  }, [sourceTrack, active]);

  // Stop generated tracks when they're swapped out so we don't leak pipelines.
  useEffect(() => {
    return () => {
      if (displayedTrack && displayedTrack !== sourceTrack) {
        displayedTrack.stop();
      }
    };
  }, [displayedTrack, sourceTrack]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>react-native-webrtc-kaleidoscope</Text>
      <Text style={styles.subtitle}>v0.1 demo · mirror + blur</Text>

      <VideoPreview track={displayedTrack} />

      {stream.status === 'pending' && (
        <Text style={styles.statusLine}>requesting camera permission…</Text>
      )}
      {stream.status === 'error' && (
        <Text style={styles.errorLine}>camera error: {stream.error.message}</Text>
      )}
      {stream.status === 'idle' && Platform.OS !== 'web' && (
        <Text style={styles.statusLine}>native camera wiring lands in Commit 9</Text>
      )}

      <View style={styles.toggleRow}>
        <EffectToggles active={active} onChange={setActive} disabled={!sourceTrack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#0b0b0b',
    gap: 16,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  subtitle: { color: '#888', fontSize: 14 },
  statusLine: { color: '#888', fontSize: 12 },
  errorLine: { color: '#ff6666', fontSize: 12 },
  toggleRow: { marginTop: 8 },
});
