// Single demo screen. Local camera feed + the three-verb API:
//   - kaleidoscope(cmd)  the art: one of Background / Blur / Plasma (left, big).
//   - transform({ flip, rotate })  geometry, absolute (top right).
//   - mask({ hardness, threshold })  the segmentation edge (bottom right).
//
// The screen owns only selection state and re-issues the full command on every
// change (transform and mask are absolute). bindKaleidoscope owns the composite
// and surfaces the live track via onTrack. Presets come from the book in
// ../kaleidoscope.presets; transforms are not presets, they're the transform verb.

import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  bindKaleidoscope,
  type KaleidoscopeControls,
  LAYER_CONTROLS,
  type LayerPatch,
} from 'react-native-webrtc-kaleidoscope';
import {
  KaleidoscopePicker,
  PresetTile,
  type RenderTile,
} from 'react-native-webrtc-kaleidoscope/ui';
import { type PresetId, presets } from '../kaleidoscope.presets';
import { LayerControlPanel } from '../src/layer-controls';
import { MaskPanel } from '../src/mask-panel';
import { type Preset, RadioToggles } from '../src/radio-toggles';
import { useLoopbackStream } from '../src/use-loopback-stream';
import { VideoPreview } from '../src/video-preview';

// Demo-owned (consumer-supplied) ids, for the badge only; the mechanism is
// identical to the library presets. The demo dogfoods the library's
// KaleidoscopePicker, which derives its families from the book itself; the
// badge rides on the picker's renderTile slot.
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
    badge={DEMO_OWNED.has(preset.id) ? 'demo-owned' : undefined}
  />
);

// Pull a composite's tunable layers (clouds/godrays/blur/plasma/...) from the
// book, keyed by LAYER ID, to seed the generated control panels. Each carries
// its shader (to pick the right LAYER_CONTROLS and to type the emitted patch)
// and its baked uniforms.
type UniformMap = Record<string, number | readonly number[]>;
type TunableLayer = { readonly shader: string; readonly uniforms: UniformMap };
const tunableLayersOf = (id: PresetId | null): Record<string, TunableLayer> | null => {
  if (!id) return null;
  const p = presets[id];
  if (!p) return null;
  const out: Record<string, TunableLayer> = {};
  for (const layer of p.layers) {
    if ('uniforms' in layer && layer.shader in LAYER_CONTROLS) {
      out[layer.id] = { shader: layer.shader, uniforms: { ...layer.uniforms } };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
};

// Rotate is single-select among the snapped angles transform() accepts.
const ROTATE_LIST: ReadonlyArray<Preset<string>> = [
  { id: '0', label: '0°' },
  { id: '90', label: '90°' },
  { id: '180', label: '180°' },
  { id: '270', label: '270°' },
];

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

const RowLabel = ({ children }: { children: ReactNode }) => (
  <Text style={styles.rowLabel}>{children}</Text>
);

const FlipToggle = ({
  label,
  icon,
  on,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityState={{ checked: on, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[styles.flipBtn, on && styles.flipBtnOn, disabled && styles.flipBtnDisabled]}
  >
    <Text style={styles.flipIcon}>{icon}</Text>
    <Text style={styles.flipLabel}>{label}</Text>
  </Pressable>
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
  const [controls, setControls] = useState<KaleidoscopeControls<typeof presets> | null>(null);
  const [layerOverrides, setLayerOverrides] = useState<Record<string, TunableLayer> | null>(null);

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
  // null case so each call matches a kaleidoscope() overload (a preset id, or
  // null to clear) rather than the union.
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
  // Layer tuning: when a composite with tunable layers is active, seed each
  // layer's controls from its baked uniforms (keyed by layer id). The verb's
  // preset switch already reset the live channel, so no explicit clear is needed.
  useEffect(() => {
    setLayerOverrides(tunableLayersOf(art));
  }, [art]);

  // A slider drag emits a LayerPatch addressed by layer id; routing it through
  // kaleidoscope(activeId, [patch]) merges it live (no rebuild) when the patched
  // preset is the active one.
  const onLayerChange = (id: string, name: string, value: number | readonly number[]) => {
    setLayerOverrides((prev) => {
      const cur = prev ?? {};
      const layer = cur[id];
      if (!layer) return prev;
      const next = { ...cur, [id]: { ...layer, uniforms: { ...layer.uniforms, [name]: value } } };
      if (art && controls) {
        const patch = {
          id,
          shader: layer.shader,
          uniforms: { [name]: value },
        } as LayerPatch;
        controls.kaleidoscope(art, [patch]);
      }
      return next;
    });
  };

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
            {layerOverrides &&
              Object.entries(layerOverrides).map(([id, layer]) => (
                <View key={id} style={styles.layerControls}>
                  <LayerControlPanel
                    title={id}
                    controls={LAYER_CONTROLS[layer.shader] ?? []}
                    values={layer.uniforms}
                    onChange={(name, value) => onLayerChange(id, name, value)}
                    disabled={disabled}
                  />
                </View>
              ))}
          </Section>

          <View style={styles.rightColumn}>
            <Section title="transform">
              <RowLabel>Flip</RowLabel>
              <View style={styles.flipRow}>
                <FlipToggle
                  label="X"
                  icon="↔"
                  on={flipX}
                  disabled={disabled}
                  onPress={() => setFlipX((v) => !v)}
                />
                <FlipToggle
                  label="Y"
                  icon="↕"
                  on={flipY}
                  disabled={disabled}
                  onPress={() => setFlipY((v) => !v)}
                />
              </View>
              <RowLabel>Rotate</RowLabel>
              <RadioToggles
                presets={ROTATE_LIST}
                value={String(rotate)}
                onSelect={(v) => setRotate(v == null ? 0 : Number(v))}
                disabled={disabled}
                columns={4}
              />
            </Section>

            <Section title="mask">
              <MaskPanel
                hardness={hardness}
                threshold={threshold}
                onChange={(m) => {
                  setHardness(m.hardness);
                  setThreshold(m.threshold);
                }}
                disabled={disabled}
              />
            </Section>

            <Pressable onPress={onReset} style={styles.resetBtn}>
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
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
  rowLabel: { color: '#777', fontSize: 11, fontWeight: '600', marginTop: 4 },
  layerControls: { marginTop: 12, gap: 8 },
  flipRow: { flexDirection: 'row', gap: 8 },
  flipBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    alignItems: 'center',
    gap: 2,
  },
  flipBtnOn: { backgroundColor: '#4a8f3f' },
  flipBtnDisabled: { opacity: 0.5 },
  flipIcon: { color: '#fff', fontSize: 22, lineHeight: 26 },
  flipLabel: { color: '#fff', fontWeight: '500', fontSize: 13 },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#222',
    borderRadius: 6,
  },
  resetText: { color: '#aaa', fontSize: 12, fontWeight: '600' },
});
