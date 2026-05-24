// Single demo screen. Local camera feed + grouped preset toggles in three
// columns (Translate / Background / Blur). Each preset maps to an EffectSpec
// passed to applyVideoEffects.

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { applyVideoEffects, type EffectSpec } from 'react-native-webrtc-kaleidoscope';
// The library ships these presets; each resolves to a bundled WebP URL on web
// and to the preset name on native. This is the same import an end user gets.
import { darkOffice } from 'react-native-webrtc-kaleidoscope/backgrounds/dark-office';
import { lightOffice } from 'react-native-webrtc-kaleidoscope/backgrounds/light-office';
import { EffectToggles } from '../src/effect-toggles';
import { EffectTuningPanel } from '../src/effect-tuning-panel';
import { useLoopbackStream } from '../src/use-loopback-stream';
import { VideoPreview } from '../src/video-preview';

type PresetId =
  | 'flip-x'
  | 'flip-y'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'blur'
  | 'dark-office'
  | 'light-office';

const presetToSpec = (id: PresetId): EffectSpec => {
  switch (id) {
    case 'flip-x':
    case 'flip-y':
    case 'rotate-cw':
    case 'rotate-ccw':
      return { name: id };
    case 'blur':
      return { name: 'blur' };
    case 'dark-office':
      return { name: 'background-image', source: darkOffice };
    case 'light-office':
      return { name: 'background-image', source: lightOffice };
  }
};

type Preset = { id: PresetId; label: string; icon?: string };

// Translate: geometric calibration ops. On web they behave in display space
// (the reference); the native pipelines correct for the camera buffer rotation
// so the on-screen result matches across platforms.
const TRANSLATE: ReadonlyArray<Preset> = [
  { id: 'flip-x', label: 'Flip X', icon: '↔' },
  { id: 'flip-y', label: 'Flip Y', icon: '↕' },
  { id: 'rotate-cw', label: 'Rotate CW', icon: '↻' },
  { id: 'rotate-ccw', label: 'Rotate CCW', icon: '↺' },
];
const BACKGROUND: ReadonlyArray<Preset> = [
  { id: 'dark-office', label: 'Dark Office' },
  { id: 'light-office', label: 'Light Office' },
];
const BLUR: ReadonlyArray<Preset> = [{ id: 'blur', label: '5-tap' }];

// Order matters because chained transforms compose left-to-right: geometric
// transforms first (cheap), then blur, then the background composite.
const APPLY_ORDER: ReadonlyArray<PresetId> = [
  'flip-x',
  'flip-y',
  'rotate-cw',
  'rotate-ccw',
  'blur',
  'dark-office',
  'light-office',
];

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={styles.title}>react-native-webrtc-kaleidoscope</Text>
        <Text style={styles.subtitle}>demo · transform, blur, background image</Text>

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

        <View style={styles.sections}>
          <Section title="Translate">
            <EffectToggles
              presets={TRANSLATE}
              active={active}
              onChange={setActive}
              disabled={!sourceTrack}
              columns={2}
            />
          </Section>
          <Section title="Background">
            <EffectToggles
              presets={BACKGROUND}
              active={active}
              onChange={setActive}
              disabled={!sourceTrack}
              columns={2}
            />
          </Section>
          <Section title="Blur">
            <EffectToggles
              presets={BLUR}
              active={active}
              onChange={setActive}
              disabled={!sourceTrack}
            />
          </Section>
        </View>

        <EffectTuningPanel />
      </View>
    </ScrollView>
  );
}

const MAX_WIDTH = 1280; // ~ Tailwind 7xl (80rem)

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0b0b0b' },
  scrollContent: { padding: 16, paddingTop: 48, alignItems: 'center' },
  container: { width: '100%', maxWidth: MAX_WIDTH, gap: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  subtitle: { color: '#888', fontSize: 14 },
  statusLine: { color: '#888', fontSize: 12 },
  errorLine: { color: '#ff6666', fontSize: 12 },
  sections: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  section: { flex: 1, minWidth: 160, gap: 8 },
  sectionTitle: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
