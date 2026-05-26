// Single demo screen. Local camera feed + two single-select banks, driven by
// the kaleidoscope() command over the consumer preset book.
//   - Shaders (the art axis): one of Background / Blur / Plasma.
//   - Translations (the transform axis): flip / rotate, composed on top.
//
// The screen owns only selection state; kaleidoscope() owns the composite and
// applies art-first / transform-last, and surfaces the live output track via
// onTrack (web yields a new track per command, native mutates in place). The
// presets live in ../kaleidoscope.presets; this screen just commands them.

import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type KaleidoscopeSession, kaleidoscope } from 'react-native-webrtc-kaleidoscope';
import { type PresetId, presets } from '../kaleidoscope.presets';
import { BackgroundMenu, type BackgroundTile } from '../src/background-menu';
import { EffectTuningPanel } from '../src/effect-tuning-panel';
import { type Preset, RadioToggles } from '../src/radio-toggles';
import { useLoopbackStream } from '../src/use-loopback-stream';
import { VideoPreview } from '../src/video-preview';

// Bank groupings (subsets of the book's ids) with display labels. The ids must
// exist in the book; selecting one commands kaleidoscope().
const BACKGROUND_IDS: ReadonlyArray<{ id: PresetId; label: string }> = [
  { id: 'simiancraft-light', label: 'Simiancraft Light' },
  { id: 'simiancraft-dark', label: 'Simiancraft Dark' },
  { id: 'debug-resolutions', label: 'Debug Grid' },
  { id: 'dark-office', label: 'Dark Office' },
  { id: 'light-office', label: 'Light Office' },
  { id: 'home-light', label: 'Home Light' },
  { id: 'home-dark', label: 'Home Dark' },
  { id: 'nature-light', label: 'Nature Light' },
  { id: 'nature-dark', label: 'Nature Dark' },
  { id: 'stylized-light', label: 'Stylized Light' },
  { id: 'stylized-dark', label: 'Stylized Dark' },
];
const BLUR_LIST: ReadonlyArray<Preset<PresetId>> = [
  { id: 'blur-low', label: 'Low' },
  { id: 'blur-medium', label: 'Medium' },
  { id: 'blur-high', label: 'High' },
];
const PLASMA_LIST: ReadonlyArray<Preset<PresetId>> = [
  { id: 'plasma-ocean', label: 'Ocean' },
  { id: 'plasma-sunset', label: 'Sunset' },
  { id: 'plasma-mint', label: 'Mint' },
  { id: 'plasma-fast', label: 'Fast' },
];
const FLIP_LIST: ReadonlyArray<Preset<PresetId>> = [
  { id: 'flip-x', label: 'X', icon: '↔' },
  { id: 'flip-y', label: 'Y', icon: '↕' },
];
const ROTATE_LIST: ReadonlyArray<Preset<PresetId>> = [
  { id: 'rotate-cw', label: 'CW', icon: '↻' },
  { id: 'rotate-ccw', label: 'CCW', icon: '↺' },
];

// Thumbnails read their image straight out of the book (single source of truth).
const bgSource = (id: PresetId): string => {
  const p = presets[id];
  return p.shader === 'background-image' ? (p.options.source as string) : '';
};
const BACKGROUND_TILES: ReadonlyArray<BackgroundTile<PresetId>> = BACKGROUND_IDS.map(
  ({ id, label }) => ({ id, label, source: bgSource(id) }),
);

// Build identity, so a tester can read off-device exactly which commit is
// running and whether a new build actually shipped.
const VERSION = Constants.expoConfig?.version ?? '?';
const BUILD = (Constants.expoConfig?.extra?.build ?? {}) as { gitSha?: string; builtAt?: string };
const GIT_SHA = (BUILD.gitSha ?? 'local').slice(0, 7);
const BUILT_AT = BUILD.builtAt ? `${BUILD.builtAt.replace('T', ' ').slice(0, 16)}Z` : 'dev';
const BUILD_LINE = `v${VERSION} · ${GIT_SHA} · ${BUILT_AT}`;

const Section = ({
  title,
  flex = 1,
  children,
}: {
  title: string;
  flex?: number;
  children: ReactNode;
}) => (
  <View style={[styles.section, { flex }]}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const RowLabel = ({ children }: { children: ReactNode }) => (
  <Text style={styles.rowLabel}>{children}</Text>
);

export default function DemoScreen() {
  const stream = useLoopbackStream();
  // Selection per axis (single-select). The book id is the kaleidoscope command.
  const [art, setArt] = useState<PresetId | null>(null);
  const [transform, setTransform] = useState<PresetId | null>(null);
  const [displayTrack, setDisplayTrack] = useState<MediaStreamTrack | null>(null);
  const [session, setSession] = useState<KaleidoscopeSession<typeof presets> | null>(null);

  const sourceTrack = useMemo<MediaStreamTrack | null>(() => {
    if (stream.status !== 'ready') return null;
    return (stream.stream.getVideoTracks()[0] ?? null) as unknown as MediaStreamTrack | null;
  }, [stream]);

  // Bind kaleidoscope once per source track; dispose on teardown.
  useEffect(() => {
    if (!sourceTrack) {
      setSession(null);
      return;
    }
    const s = kaleidoscope(sourceTrack, { presets, onTrack: setDisplayTrack });
    setSession(s);
    return () => {
      s.dispose();
      setDisplayTrack(null);
    };
  }, [sourceTrack]);

  // Apply the art selection (or clear the axis) through the command.
  useEffect(() => {
    if (!session) return;
    if (art) session.set(art);
    else session.clear('art');
  }, [session, art]);

  // Apply the transform selection (or clear the axis).
  useEffect(() => {
    if (!session) return;
    if (transform) session.set(transform);
    else session.clear('transform');
  }, [session, transform]);

  const disabled = !sourceTrack;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={styles.title}>react-native-webrtc-kaleidoscope</Text>
        <Text style={styles.subtitle}>demo · kaleidoscope() · one shader + a translation</Text>
        <Text style={styles.buildLine}>{BUILD_LINE}</Text>

        <VideoPreview track={displayTrack ?? sourceTrack} />

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
          <Section title="Shaders" flex={4}>
            <RowLabel>Background</RowLabel>
            <BackgroundMenu
              tiles={BACKGROUND_TILES}
              value={art}
              onSelect={setArt}
              disabled={disabled}
            />
            <RowLabel>Blur</RowLabel>
            <RadioToggles
              presets={BLUR_LIST}
              value={art}
              onSelect={setArt}
              disabled={disabled}
              columns={6}
            />
            <RowLabel>Plasma</RowLabel>
            <RadioToggles
              presets={PLASMA_LIST}
              value={art}
              onSelect={setArt}
              disabled={disabled}
              columns={6}
            />
          </Section>
          <Section title="Translations" flex={1}>
            <RowLabel>Flip</RowLabel>
            <RadioToggles
              presets={FLIP_LIST}
              value={transform}
              onSelect={setTransform}
              disabled={disabled}
              columns={2}
            />
            <RowLabel>Rotate</RowLabel>
            <RadioToggles
              presets={ROTATE_LIST}
              value={transform}
              onSelect={setTransform}
              disabled={disabled}
              columns={2}
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
  sections: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 8 },
  section: { flex: 1, minWidth: 240, gap: 8 },
  sectionTitle: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rowLabel: { color: '#777', fontSize: 11, fontWeight: '600', marginTop: 4 },
});
