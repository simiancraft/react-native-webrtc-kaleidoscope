// Generated tuning controls for a layer shader's uniforms. Given a shader's
// control descriptor (e.g. CLOUDS_CONTROLS) and the current values, it renders a
// slider per scalar and an R/G/B triple per color, and reports edits up. The host
// pushes edits into the running scene via setLayerUniforms (no pipeline rebuild).

import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UniformControl } from 'react-native-webrtc-kaleidoscope';

type UniformValue = number | readonly number[];
type Values = Readonly<Record<string, UniformValue>>;

// Web-only clipboard write (the control panels only render on web, where scenes
// run). Typed off globalThis so it needs no DOM lib and no-ops on native.
const copyToClipboard = (text: string): void => {
  const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => unknown } } })
    .navigator;
  nav?.clipboard?.writeText?.(text);
};

type Props = {
  controls: readonly UniformControl[];
  values: Values;
  onChange: (name: string, value: UniformValue) => void;
  disabled?: boolean;
};

const CH = ['R', 'G', 'B'] as const;

// @react-native-community/slider's web wrapper maps a value of exactly 0 (and
// NaN/undefined) to `undefined`, because `!props.value` treats 0 as falsy; its
// web component then crashes on `undefined.toFixed()`. So never hand the slider
// an exact 0: a hair above zero is visually identical and keeps the control
// alive. The real (possibly 0) value still flows through onValueChange and the
// readouts, so this is presentation-only.
const SLIDER_EPSILON = 1e-4;
const safeSliderValue = (v: number): number => (Number.isFinite(v) && v !== 0 ? v : SLIDER_EPSILON);

// Clean values for the copy button: round off the float noise (the epsilon
// above, drag jitter) and snap near-zero back to a true 0 so pasted JSON reads
// as intended.
const roundForCopy = (values: Values): Record<string, UniformValue> => {
  const round = (n: number): number => {
    const r = Math.round(n * 1e4) / 1e4;
    return Math.abs(r) < 1e-4 ? 0 : r;
  };
  const out: Record<string, UniformValue> = {};
  for (const [k, val] of Object.entries(values)) {
    out[k] = Array.isArray(val) ? val.map(round) : round(val as number);
  }
  return out;
};

function ColorRow({
  label,
  rgb,
  onChange,
  disabled,
}: {
  label: string;
  rgb: readonly number[];
  onChange: (rgb: number[]) => void;
  disabled: boolean;
}) {
  const r = rgb[0] ?? 0;
  const g = rgb[1] ?? 0;
  const b = rgb[2] ?? 0;
  const swatch = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  return (
    <View style={styles.row}>
      <View style={styles.labelLine}>
        <View style={styles.labelWrap}>
          <View style={[styles.swatch, { backgroundColor: swatch }]} />
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>
      {[r, g, b].map((v, i) => (
        <View key={CH[i]} style={styles.chanLine}>
          <Text style={styles.chan}>{CH[i]}</Text>
          <Slider
            style={styles.chanSlider}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={safeSliderValue(v)}
            disabled={disabled}
            onValueChange={(nv) => {
              const next = [r, g, b];
              next[i] = nv;
              onChange(next);
            }}
            minimumTrackTintColor="#8888ff"
            maximumTrackTintColor="#444"
            thumbTintColor="#eeeeff"
          />
        </View>
      ))}
    </View>
  );
}

function FloatRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.labelLine}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{(Number.isFinite(value) ? value : 0).toFixed(2)}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={safeSliderValue(value)}
        disabled={disabled}
        onValueChange={onChange}
        minimumTrackTintColor="#8888ff"
        maximumTrackTintColor="#444"
        thumbTintColor="#eeeeff"
      />
    </View>
  );
}

export function LayerControls({ controls, values, onChange, disabled = false }: Props) {
  return (
    <View style={styles.panel}>
      {controls.map((c) => {
        if (c.kind === 'color') {
          const rgb = values[c.name];
          return (
            <ColorRow
              key={c.name}
              label={c.name}
              rgb={Array.isArray(rgb) ? rgb : c.default}
              onChange={(v) => onChange(c.name, v)}
              disabled={disabled}
            />
          );
        }
        const v = values[c.name];
        return (
          <FloatRow
            key={c.name}
            label={c.name}
            value={typeof v === 'number' ? v : c.default}
            min={c.min}
            max={c.max}
            step={c.step}
            onChange={(nv) => onChange(c.name, nv)}
            disabled={disabled}
          />
        );
      })}
    </View>
  );
}

/**
 * A titled control panel for one layer shader: the shader name, a copy button
 * that puts the current values on the clipboard, and a slider per uniform.
 */
export function LayerControlPanel({
  title,
  controls,
  values,
  onChange,
  disabled = false,
}: Props & { title: string }) {
  return (
    <View style={styles.panelWrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          onPress={() =>
            copyToClipboard(`${title}: ${JSON.stringify(roundForCopy(values), null, 2)}`)
          }
          style={styles.copyBtn}
          disabled={disabled}
        >
          <Text style={styles.copyText}>copy</Text>
        </Pressable>
      </View>
      <LayerControls controls={controls} values={values} onChange={onChange} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  panelWrap: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  copyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
  },
  copyText: { color: '#8888ff', fontSize: 11, fontWeight: '600' },
  panel: { gap: 10 },
  row: { gap: 2 },
  labelLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 2, borderWidth: 1, borderColor: '#555' },
  label: { color: '#ccc', fontSize: 12 },
  value: { color: '#8888ff', fontSize: 12, fontVariant: ['tabular-nums'] },
  chanLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chan: { color: '#777', fontSize: 10, width: 10 },
  chanSlider: { flex: 1, height: 28 },
  slider: { width: '100%', height: 32 },
});
