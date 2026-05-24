// Single demo screen. Local camera feed + a row of preset toggles. Each
// preset maps to an EffectSpec passed to applyVideoEffects.

import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { applyVideoEffects, type EffectSpec } from 'react-native-webrtc-kaleidoscope';
// The library ships these presets; each resolves to a bundled WebP URL on web
// and to the preset name on native. This is the same import an end user gets.
import { darkOffice } from 'react-native-webrtc-kaleidoscope/backgrounds/dark-office';
import { lightOffice } from 'react-native-webrtc-kaleidoscope/backgrounds/light-office';
import { EffectToggles } from '../src/effect-toggles';
import { EffectTuningPanel } from '../src/effect-tuning-panel';
import { useLoopbackStream } from '../src/use-loopback-stream';
import { VideoPreview } from '../src/video-preview';

type PresetId = 'mirror' | 'blur' | 'dark-office' | 'light-office';

const presetToSpec = (id: PresetId): EffectSpec => {
  switch (id) {
    case 'mirror':
      return { name: 'mirror' };
    case 'blur':
      return { name: 'blur' };
    case 'dark-office':
      return { name: 'background-image', source: darkOffice };
    case 'light-office':
      return { name: 'background-image', source: lightOffice };
  }
};

const PRESETS: ReadonlyArray<{ id: PresetId; label: string }> = [
  { id: 'mirror', label: 'Mirror' },
  { id: 'blur', label: 'Blur' },
  { id: 'dark-office', label: 'Dark Office' },
  { id: 'light-office', label: 'Light Office' },
];

// Order matters because chained transforms compose left-to-right. Mirror
// first (cheap) so the segmentation pass sees a flipped image (which it
// handles fine).
const APPLY_ORDER: ReadonlyArray<PresetId> = ['mirror', 'blur', 'dark-office', 'light-office'];

export default function DemoScreen() {
  const stream = useLoopbackStream();
  const [active, setActive] = useState<ReadonlySet<PresetId>>(new Set());

  const sourceTrack = useMemo<MediaStreamTrack | null>(() => {
    if (stream.status !== 'ready') return null;
    return (stream.stream.getVideoTracks()[0] ?? null) as unknown as MediaStreamTrack | null;
  }, [stream]);

  const displayedTrack = useMemo<MediaStreamTrack | null>(() => {
    if (!sourceTrack) return null;
    const specs = APPLY_ORDER.filter((id) => active.has(id)).map(presetToSpec);
    try {
      return applyVideoEffects(sourceTrack, specs);
    } catch (err) {
      console.error(err);
      return sourceTrack;
    }
  }, [sourceTrack, active]);

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
      <Text style={styles.subtitle}>v0.1 demo · mirror, blur, background image</Text>

      <VideoPreview track={displayedTrack} />

      {stream.status === 'pending' && (
        <Text style={styles.statusLine}>requesting camera permission…</Text>
      )}
      {stream.status === 'error' && (
        <Text style={styles.errorLine}>camera error: {stream.error.message}</Text>
      )}
      {stream.status === 'idle' && Platform.OS !== 'web' && (
        <Text style={styles.statusLine}>initializing camera…</Text>
      )}

      <View style={styles.toggleRow}>
        <EffectToggles
          presets={PRESETS}
          active={active}
          onChange={setActive}
          disabled={!sourceTrack}
        />
      </View>

      <EffectTuningPanel />
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
