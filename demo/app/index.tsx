// Single demo screen, dogfooding the packaged consumable components:
//   - KaleidoscopePicker (./ui)  the selector: pick a composite -> kaleidoscope.
//   - KaleidoscopeTuner (./controls)  the editor: live-tune the active preset's
//     layer uniforms, emitting patches the host routes into kaleidoscope.
//   - KaleidoscopeMaskControls / KaleidoscopeTransformControls  the mask + geometry verbs.
//
// The screen owns only selection state and re-issues the full command on every
// change (transform and mask are absolute). bindKaleidoscope owns the composite
// and surfaces the live track via onTrack. Presets come from ../kaleidoscope.preset-book.

import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  bindKaleidoscope,
  type KaleidoscopeBinding,
  type PatchesFor,
} from 'react-native-webrtc-kaleidoscope';
import {
  KaleidoscopePicker,
  PresetTile,
  type RenderTile,
} from 'react-native-webrtc-kaleidoscope/picker';
import {
  KaleidoscopeMaskControls,
  KaleidoscopeThemeProvider,
  KaleidoscopeTransformControls,
  KaleidoscopeTuner,
} from 'react-native-webrtc-kaleidoscope/tuner';
import { type PresetId, presets } from '../kaleidoscope.preset-book';
import { useLoopbackStream } from '../src/use-loopback-stream';
import { VideoPreview } from '../src/video-preview';

// Demo-owned (consumer-supplied) ids, for the badge only; the mechanism is
// identical to the library presets. The badge rides on the picker's renderTile slot.
const DEMO_OWNED: ReadonlySet<string> = new Set([
  'wolf-cave',
  'underwater',
  'wizard-tower',
  'fairy-cave',
  'nebula',
  'simianlights',
  'clouds',
  'observation-deck',
  'corporate-blobs',
]);

const renderDemoTile: RenderTile = (preset, state) => (
  <PresetTile
    label={preset.label}
    uri={state.uri}
    selected={state.selected}
    disabled={state.disabled}
    onPress={state.onPress}
    testID={state.testID}
    badge={DEMO_OWNED.has(preset.id) ? 'demo-owned' : undefined}
  />
);

const VERSION = Constants.expoConfig?.version ?? '?';
const BUILD = (Constants.expoConfig?.extra?.build ?? {}) as { gitSha?: string; builtAt?: string };
const GIT_SHA = (BUILD.gitSha ?? 'local').slice(0, 7);
const BUILT_AT = BUILD.builtAt ? `${BUILD.builtAt.replace('T', ' ').slice(0, 16)}Z` : 'dev';
const BUILD_LINE = `v${VERSION} · ${GIT_SHA} · ${BUILT_AT}`;

const Section = ({
  title,
  flex,
  children,
}: {
  title: string;
  flex?: number;
  children: ReactNode;
}) => (
  <View style={[styles.section, flex != null ? { flex } : null]}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

export default function DemoScreen() {
  const stream = useLoopbackStream();
  const [art, setArt] = useState<PresetId | null>(null);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [rotate, setRotate] = useState(0);
  const [hardness, setHardness] = useState(0.6);
  const [threshold, setThreshold] = useState(0.75);
  const [displayTrack, setDisplayTrack] = useState<MediaStreamTrack | null>(null);
  const [controls, setControls] = useState<KaleidoscopeBinding<typeof presets> | null>(null);

  const sourceTrack = useMemo<MediaStreamTrack | null>(() => {
    if (stream.status !== 'ready') return null;
    return (stream.stream.getVideoTracks()[0] ?? null) as unknown as MediaStreamTrack | null;
  }, [stream]);

  // Bind once per source track.
  useEffect(() => {
    if (!sourceTrack) {
      setControls(null);
      return;
    }
    const c = bindKaleidoscope(sourceTrack, { presets, onTrack: setDisplayTrack });
    setControls(c);
    return () => {
      c.dispose();
      setDisplayTrack(null);
    };
  }, [sourceTrack]);

  // Re-issue each verb on change (transform and mask are absolute). Split the
  // null case so each call matches a kaleidoscope() overload.
  useEffect(() => {
    if (!controls) return;
    if (art) controls.kaleidoscope(art);
    else controls.kaleidoscope(null);
  }, [controls, art]);
  useEffect(() => {
    controls?.transform({ flip: { x: flipX, y: flipY }, rotate });
  }, [controls, flipX, flipY, rotate]);
  useEffect(() => {
    controls?.mask({ hardness, threshold });
  }, [controls, hardness, threshold]);

  const disabled = !sourceTrack;
  const onReset = () => {
    setArt(null);
    setFlipX(false);
    setFlipY(false);
    setRotate(0);
    setHardness(0.6);
    setThreshold(0.75);
  };

  return (
    <KaleidoscopeThemeProvider>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.title}>react-native-webrtc-kaleidoscope</Text>
          <Text style={styles.subtitle}>demo · kaleidoscope · transform · mask</Text>
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
            <Section title="kaleidoscope" flex={4}>
              <KaleidoscopePicker
                presets={presets}
                value={art}
                onSelect={setArt}
                disabled={disabled}
                renderTile={renderDemoTile}
                className="rounded-xl bg-neutral-900 p-3"
              />
              <View style={styles.tuner}>
                <KaleidoscopeTuner
                  presets={presets}
                  value={art}
                  disabled={disabled}
                  onPatch={(patch) => {
                    if (art && controls) {
                      controls.kaleidoscope(art, [patch] as PatchesFor<typeof presets, PresetId>);
                    }
                  }}
                />
              </View>
            </Section>

            <View style={styles.rightColumn}>
              <KaleidoscopeTransformControls
                flip={{ x: flipX, y: flipY }}
                rotate={rotate}
                disabled={disabled}
                onChange={(t) => {
                  setFlipX(t.flip?.x ?? false);
                  setFlipY(t.flip?.y ?? false);
                  setRotate(t.rotate ?? 0);
                }}
              />
              <KaleidoscopeMaskControls
                hardness={hardness}
                threshold={threshold}
                disabled={disabled}
                onChange={(m) => {
                  setHardness(m.hardness);
                  setThreshold(m.threshold);
                }}
              />
              <Pressable onPress={onReset} style={styles.resetBtn}>
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KaleidoscopeThemeProvider>
  );
}

const MAX_WIDTH = 1280;

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
  section: { minWidth: 240, gap: 8 },
  rightColumn: { flex: 1, minWidth: 240, gap: 24 },
  sectionTitle: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tuner: { marginTop: 12, gap: 12 },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#222',
    borderRadius: 6,
  },
  resetText: { color: '#aaa', fontSize: 12, fontWeight: '600' },
});
