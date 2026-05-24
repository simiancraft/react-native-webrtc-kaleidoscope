// Dev-time sliders for tuning the GLSL effects at runtime. Each slider
// calls into the library's set* exports, which in turn write to the
// per-platform EffectTuning state. Per-frame processors read those
// values, so changes are visible on the next rendered frame.

import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  resetEffectTuning,
  setBlurSigma,
  setMaskHardness,
  setMaskThreshold,
} from 'react-native-webrtc-kaleidoscope';

// Defense in depth: when the native module is missing (a misconfigured EAS
// build, a fresh dev-client that hasn't been rebuilt after a podspec bump,
// etc.) every setter throws. Swallow that here so the slider still tracks
// the user's drag — visual feedback works even when no pixels are being
// re-tuned native-side. The state setters in each handler MUST stay
// OUTSIDE this wrapper for that to hold.
const safeCall = (fn: () => void) => {
  try {
    fn();
  } catch (err) {
    console.warn('[kaleidoscope demo] effect-tuning call failed; native module unavailable?', err);
  }
};

type TuningRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function TuningRow({ label, value, min, max, step, onChange }: TuningRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.labelLine}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{(value ?? 0).toFixed(2)}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor="#8888ff"
        maximumTrackTintColor="#444"
        thumbTintColor="#eeeeff"
      />
    </View>
  );
}

export function EffectTuningPanel() {
  const [expanded, setExpanded] = useState(false);
  const [blurSigma, setBlurSigmaLocal] = useState(5);
  const [maskHardness, setMaskHardnessLocal] = useState(0.5);
  const [maskThreshold, setMaskThresholdLocal] = useState(0.7);

  const onBlurSigma = (next: number) => {
    setBlurSigmaLocal(next);
    safeCall(() => setBlurSigma(next));
  };

  const onMaskHardness = (next: number) => {
    setMaskHardnessLocal(next);
    safeCall(() => setMaskHardness(next));
  };

  const onMaskThreshold = (next: number) => {
    setMaskThresholdLocal(next);
    safeCall(() => setMaskThreshold(next));
  };

  const onReset = () => {
    setBlurSigmaLocal(5);
    setMaskHardnessLocal(0.5);
    setMaskThresholdLocal(0.7);
    safeCall(() => resetEffectTuning());
  };

  return (
    <View style={styles.panel}>
      <Pressable onPress={() => setExpanded(!expanded)} style={styles.header}>
        <Text style={styles.headerText}>{expanded ? 'v' : '>'} Effect tuning</Text>
      </Pressable>
      {expanded && (
        <View style={styles.body}>
          <TuningRow
            label="Blur sigma"
            value={blurSigma}
            min={0.5}
            max={7}
            step={0.5}
            onChange={onBlurSigma}
          />
          <TuningRow
            label="Mask hardness"
            value={maskHardness}
            min={0.01}
            max={1}
            step={0.01}
            onChange={onMaskHardness}
          />
          <TuningRow
            label="Mask threshold"
            value={maskThreshold}
            min={0.05}
            max={0.95}
            step={0.01}
            onChange={onMaskThreshold}
          />
          <Pressable onPress={onReset} style={styles.resetButton}>
            <Text style={styles.resetText}>Reset to defaults</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#0f0f0f',
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    padding: 12,
    gap: 12,
  },
  row: {
    gap: 4,
  },
  labelLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#ccc',
    fontSize: 12,
  },
  value: {
    color: '#8888ff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  slider: {
    width: '100%',
    height: 32,
  },
  resetButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#222',
    borderRadius: 4,
  },
  resetText: {
    color: '#aaa',
    fontSize: 12,
  },
});
