// Single demo screen. Local camera feed + grouped preset toggles in three
// columns (Translate / Background / Blur). Each preset maps to an EffectSpec
// passed to applyVideoEffects.

import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  applyVideoEffects,
  type BackgroundImageSpec,
  type EffectSpec,
} from 'react-native-webrtc-kaleidoscope';
// The library ships these presets; each resolves to a bundled WebP URL on web
// and to the preset name on native. This is the same import an end user gets.
import { darkOffice } from 'react-native-webrtc-kaleidoscope/backgrounds/dark-office';
import { debugResolutions } from 'react-native-webrtc-kaleidoscope/backgrounds/debug-resolutions';
import { homeDark } from 'react-native-webrtc-kaleidoscope/backgrounds/home-dark';
import { homeLight } from 'react-native-webrtc-kaleidoscope/backgrounds/home-light';
import { lightOffice } from 'react-native-webrtc-kaleidoscope/backgrounds/light-office';
import { natureDark } from 'react-native-webrtc-kaleidoscope/backgrounds/nature-dark';
import { natureLight } from 'react-native-webrtc-kaleidoscope/backgrounds/nature-light';
import { simiancraftDark } from 'react-native-webrtc-kaleidoscope/backgrounds/simiancraft-dark';
import { simiancraftLight } from 'react-native-webrtc-kaleidoscope/backgrounds/simiancraft-light';
import { stylizedDark } from 'react-native-webrtc-kaleidoscope/backgrounds/stylized-dark';
import { stylizedLight } from 'react-native-webrtc-kaleidoscope/backgrounds/stylized-light';
import { EffectToggles } from '../src/effect-toggles';
import { EffectTuningPanel } from '../src/effect-tuning-panel';
import { useLoopbackStream } from '../src/use-loopback-stream';
import { VideoPreview } from '../src/video-preview';

type TransformId = 'flip-x' | 'flip-y' | 'rotate-cw' | 'rotate-ccw';
type BackgroundId =
  | 'debug-resolutions'
  | 'dark-office'
  | 'light-office'
  | 'home-light'
  | 'home-dark'
  | 'nature-light'
  | 'nature-dark'
  | 'stylized-light'
  | 'stylized-dark'
  | 'simiancraft-light'
  | 'simiancraft-dark';
type PresetId = TransformId | 'blur' | BackgroundId;

type BackgroundEntry = { id: BackgroundId; label: string; source: BackgroundImageSpec['source'] };

// The shipped background-image presets, in demo order. Data-driven so adding a
// preset is one row, not a switch case plus a button.
const BACKGROUNDS: ReadonlyArray<BackgroundEntry> = [
  { id: 'debug-resolutions', label: 'Debug Grid', source: debugResolutions },
  { id: 'dark-office', label: 'Dark Office', source: darkOffice },
  { id: 'light-office', label: 'Light Office', source: lightOffice },
  { id: 'home-light', label: 'Home Light', source: homeLight },
  { id: 'home-dark', label: 'Home Dark', source: homeDark },
  { id: 'nature-light', label: 'Nature Light', source: natureLight },
  { id: 'nature-dark', label: 'Nature Dark', source: natureDark },
  { id: 'stylized-light', label: 'Stylized Light', source: stylizedLight },
  { id: 'stylized-dark', label: 'Stylized Dark', source: stylizedDark },
  { id: 'simiancraft-light', label: 'Simiancraft Light', source: simiancraftLight },
  { id: 'simiancraft-dark', label: 'Simiancraft Dark', source: simiancraftDark },
];
const BACKGROUND_BY_ID = new Map(BACKGROUNDS.map((b) => [b.id, b] as const));

const presetToSpec = (id: PresetId): EffectSpec => {
  switch (id) {
    case 'flip-x':
    case 'flip-y':
    case 'rotate-cw':
    case 'rotate-ccw':
      return { name: id };
    case 'blur':
      return { name: 'blur' };
    default: {
      const bg = BACKGROUND_BY_ID.get(id);
      if (!bg) throw new Error(`kaleidoscope demo: unknown preset ${id}`);
      return { name: 'background-image', source: bg.source };
    }
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
// Debug grid gets its own full-width row; the scene presets share a 2-up grid.
const BACKGROUND_DEBUG = BACKGROUNDS.filter((b) => b.id === 'debug-resolutions');
const BACKGROUND_SCENES = BACKGROUNDS.filter((b) => b.id !== 'debug-resolutions');
const BLUR: ReadonlyArray<Preset> = [{ id: 'blur', label: '5-tap' }];

// Order matters because chained transforms compose left-to-right: geometric
// transforms first (cheap), then blur, then the background composite.
const APPLY_ORDER: ReadonlyArray<PresetId> = [
  'flip-x',
  'flip-y',
  'rotate-cw',
  'rotate-ccw',
  'blur',
  ...BACKGROUNDS.map((b) => b.id),
];

// Build identity, so a tester can read off-device exactly which commit is
// running and whether a new build actually shipped.
const VERSION = Constants.expoConfig?.version ?? '?';
const BUILD = (Constants.expoConfig?.extra?.build ?? {}) as {
  gitSha?: string;
  builtAt?: string;
};
const GIT_SHA = (BUILD.gitSha ?? 'local').slice(0, 7);
const BUILT_AT = BUILD.builtAt ? `${BUILD.builtAt.replace('T', ' ').slice(0, 16)}Z` : 'dev';
const BUILD_LINE = `v${VERSION} · ${GIT_SHA} · ${BUILT_AT}`;

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
        <Text style={styles.buildLine}>{BUILD_LINE}</Text>

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
              presets={BACKGROUND_DEBUG}
              active={active}
              onChange={setActive}
              disabled={!sourceTrack}
            />
            <EffectToggles
              presets={BACKGROUND_SCENES}
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
  buildLine: {
    color: '#5a5a5a',
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
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
