// Single demo screen. Local camera feed + a row of preset toggles. Each
// preset maps to an EffectSpec passed to applyVideoEffects.

import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { applyVideoEffects, type EffectSpec } from 'react-native-webrtc-kaleidoscope';
// The library ships these presets; each resolves to a bundled WebP URL on web
// and to the preset name on native. This is the same import an end user gets.
import { office1 } from 'react-native-webrtc-kaleidoscope/backgrounds/office-1';
import { office2 } from 'react-native-webrtc-kaleidoscope/backgrounds/office-2';
import { EffectToggles } from '../src/effect-toggles';
import { EffectTuningPanel } from '../src/effect-tuning-panel';
import { useLoopbackStream } from '../src/use-loopback-stream';
import { VideoPreview } from '../src/video-preview';

type PresetId = 'mirror' | 'blur' | 'office-1' | 'office-2' | 'gpu-passthrough';

const presetToSpec = (id: PresetId): EffectSpec => {
  switch (id) {
    case 'mirror':
      return { name: 'mirror' };
    case 'blur':
      return { name: 'blur' };
    case 'office-1':
      return { name: 'background-image', source: office1 };
    case 'office-2':
      return { name: 'background-image', source: office2 };
    case 'gpu-passthrough':
      return { name: 'gpu-passthrough' };
  }
};

// gpu-passthrough is an Android-only architecture-proof hook (also handled
// on web via its own registry); iOS does not register it (see
// src/index.ts:IOS_REGISTERED_EFFECTS and Registration.swift). Hide the
// preset on iOS so users don't trigger the library's "dropping unregistered
// effects" warning by pressing a button that does nothing on this platform.
const PRESETS: ReadonlyArray<{ id: PresetId; label: string }> = [
  { id: 'mirror', label: 'Mirror' },
  { id: 'blur', label: 'Blur' },
  { id: 'office-1', label: 'Office 1' },
  { id: 'office-2', label: 'Office 2' },
  ...(Platform.OS === 'ios'
    ? []
    : ([{ id: 'gpu-passthrough', label: 'GPU passthrough' }] as const)),
];

// Order matters because chained transforms compose left-to-right. Mirror
// first (cheap) so the segmentation pass sees a flipped image (which it
// handles fine). gpu-passthrough is last because it's a no-op pass on
// platforms that register it; on iOS it's filtered out of PRESETS above
// and applying it from the active set is a no-op via the JS facade's
// platform filter.
const APPLY_ORDER: ReadonlyArray<PresetId> = [
  'mirror',
  'blur',
  'office-1',
  'office-2',
  'gpu-passthrough',
];

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
