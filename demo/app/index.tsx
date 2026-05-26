// Single demo screen. Local camera feed + two single-select banks that match
// the library's domain:
//   - Shaders (the art axis): one of Background / Blur / Plasma. Single-select
//     across all three rows, because they all fill the one background slot and
//     only the last would win anyway.
//   - Translations (the transform axis): flip / rotate, composed on top.
//
// Apply order is art FIRST, transform LAST. Segmentation runs inside the art
// stage, so it must see the upright camera frame; the transform then reorients
// the finished composite. Transform-first would segment a rotated body and
// mask the wrong region (the "it grabs the ceiling" bug).

import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  applyVideoEffects,
  type BackgroundImageSpec,
  type EffectSpec,
  type PlasmaSpec,
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
import { BackgroundMenu, type BackgroundTile } from '../src/background-menu';
import { EffectTuningPanel } from '../src/effect-tuning-panel';
import { type Preset, RadioToggles } from '../src/radio-toggles';
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
type BlurId = 'blur-low' | 'blur-medium' | 'blur-high';
type PlasmaId = 'plasma-ocean' | 'plasma-sunset' | 'plasma-mint' | 'plasma-fast';
// The art axis: one shader of any kind. Blur is a shader (sigma is its uniform);
// background-image is a shader (its source is its uniform); plasma is a shader.
type ArtId = BackgroundId | BlurId | PlasmaId;

type BackgroundEntry = { id: BackgroundId; label: string; source: BackgroundImageSpec['source'] };

// Simiancraft presets lead (it's the shop's demo), then the debug grid and the
// scene presets.
const BACKGROUNDS: ReadonlyArray<BackgroundEntry> = [
  { id: 'simiancraft-light', label: 'Simiancraft Light', source: simiancraftLight },
  { id: 'simiancraft-dark', label: 'Simiancraft Dark', source: simiancraftDark },
  { id: 'debug-resolutions', label: 'Debug Grid', source: debugResolutions },
  { id: 'dark-office', label: 'Dark Office', source: darkOffice },
  { id: 'light-office', label: 'Light Office', source: lightOffice },
  { id: 'home-light', label: 'Home Light', source: homeLight },
  { id: 'home-dark', label: 'Home Dark', source: homeDark },
  { id: 'nature-light', label: 'Nature Light', source: natureLight },
  { id: 'nature-dark', label: 'Nature Dark', source: natureDark },
  { id: 'stylized-light', label: 'Stylized Light', source: stylizedLight },
  { id: 'stylized-dark', label: 'Stylized Dark', source: stylizedDark },
];

// Blur levels: one blur shader, three sigmas (the parameter channel in action).
const BLUR_SIGMA: Record<BlurId, number> = {
  'blur-low': 1.5,
  'blur-medium': 4,
  'blur-high': 7,
};

// Plasma presets: one plasma.frag, many named uniform bundles (synth-patch
// model). Web only for now; native plasma is filtered until its processor lands.
const PLASMA_PRESETS: Record<PlasmaId, PlasmaSpec> = {
  'plasma-ocean': { name: 'plasma', colorA: [0.0, 0.3, 0.6], colorB: [0.0, 0.6, 0.6], speed: 0.3 },
  'plasma-sunset': { name: 'plasma', colorA: [0.9, 0.3, 0.1], colorB: [0.8, 0.1, 0.5], speed: 0.3 },
  'plasma-mint': { name: 'plasma', colorA: [0.1, 0.5, 0.3], colorB: [0.6, 0.9, 0.5], speed: 0.25 },
  'plasma-fast': { name: 'plasma', colorA: [0.9, 0.3, 0.1], colorB: [0.8, 0.1, 0.5], speed: 0.9 },
};

const BACKGROUND_BY_ID = new Map(BACKGROUNDS.map((b) => [b.id, b] as const));
const PLASMA_IDS = Object.keys(PLASMA_PRESETS) as PlasmaId[];
const BLUR_IDS = Object.keys(BLUR_SIGMA) as BlurId[];

const artToSpec = (id: ArtId): EffectSpec => {
  if ((PLASMA_IDS as string[]).includes(id)) return PLASMA_PRESETS[id as PlasmaId];
  if ((BLUR_IDS as string[]).includes(id)) return { name: 'blur', sigma: BLUR_SIGMA[id as BlurId] };
  const bg = BACKGROUND_BY_ID.get(id as BackgroundId);
  if (!bg) throw new Error(`kaleidoscope demo: unknown art ${id}`);
  return { name: 'background-image', source: bg.source };
};

// Bank presets, typed to the shared ArtId so the rows act as one radio group.
// Backgrounds render as image thumbnails; blur/plasma as text tiles.
const BACKGROUND_TILES: ReadonlyArray<BackgroundTile<ArtId>> = BACKGROUNDS.map((b) => ({
  id: b.id,
  label: b.label,
  source: b.source as string,
}));
const BLUR_LIST: ReadonlyArray<Preset<ArtId>> = [
  { id: 'blur-low', label: 'Low' },
  { id: 'blur-medium', label: 'Medium' },
  { id: 'blur-high', label: 'High' },
];
const PLASMA_LIST: ReadonlyArray<Preset<ArtId>> = [
  { id: 'plasma-ocean', label: 'Ocean' },
  { id: 'plasma-sunset', label: 'Sunset' },
  { id: 'plasma-mint', label: 'Mint' },
  { id: 'plasma-fast', label: 'Fast' },
];

// Translations split into Flip and Rotate groups, each a 2-up row that shares
// the one transform selection (single-select across all four).
const FLIP_LIST: ReadonlyArray<Preset<TransformId>> = [
  { id: 'flip-x', label: 'X', icon: '↔' },
  { id: 'flip-y', label: 'Y', icon: '↕' },
];
const ROTATE_LIST: ReadonlyArray<Preset<TransformId>> = [
  { id: 'rotate-cw', label: 'CW', icon: '↻' },
  { id: 'rotate-ccw', label: 'CCW', icon: '↺' },
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
  // Two independent single-select axes. Art (shader) and transform compose, but
  // each is one-at-a-time within itself.
  const [art, setArt] = useState<ArtId | null>(null);
  const [transform, setTransform] = useState<TransformId | null>(null);

  const sourceTrack = useMemo<MediaStreamTrack | null>(() => {
    if (stream.status !== 'ready') return null;
    return (stream.stream.getVideoTracks()[0] ?? null) as unknown as MediaStreamTrack | null;
  }, [stream]);

  const displayedTrack = useMemo<MediaStreamTrack | null>(() => {
    if (!sourceTrack) return null;
    // Art FIRST (segments the upright frame), transform LAST (reorients the
    // finished composite). This is the normalize -> art -> transform order.
    const specs: EffectSpec[] = [];
    if (art) specs.push(artToSpec(art));
    if (transform) specs.push({ name: transform });
    try {
      return applyVideoEffects(sourceTrack, specs);
    } catch (err) {
      console.error(err);
      return sourceTrack;
    }
  }, [sourceTrack, art, transform]);

  useEffect(() => {
    return () => {
      if (displayedTrack && displayedTrack !== sourceTrack) {
        displayedTrack.stop();
      }
    };
  }, [displayedTrack, sourceTrack]);

  const disabled = !sourceTrack;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={styles.title}>react-native-webrtc-kaleidoscope</Text>
        <Text style={styles.subtitle}>
          demo · one shader (background / blur / plasma) + a translation
        </Text>
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
  rowLabel: {
    color: '#777',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});
