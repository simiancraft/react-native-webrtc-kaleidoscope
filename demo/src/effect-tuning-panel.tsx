// Dev-time sliders for tuning the GLSL effects at runtime. Each slider
// calls into the library's set* exports, which in turn write to the
// per-platform EffectTuning state. Per-frame processors read those
// values, so changes are visible on the next rendered frame.

import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { resetEffectTuning, setBlurSigma, setMaskHardness } from 'react-native-webrtc-kaleidoscope';

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
        <Text style={styles.value}>{value.toFixed(2)}</Text>
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
  const [blurSigma, setBlurSigmaLocal] = useState(8);
  const [maskHardness, setMaskHardnessLocal] = useState(0.5);

  const onBlurSigma = (next: number) => {
    setBlurSigmaLocal(next);
    setBlurSigma(next);
  };

  const onMaskHardness = (next: number) => {
    setMaskHardnessLocal(next);
    setMaskHardness(next);
  };

  const onReset = () => {
    setBlurSigmaLocal(8);
    setMaskHardnessLocal(0.5);
    resetEffectTuning();
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
            max={32}
            step={0.5}
            onChange={onBlurSigma}
          />
          <TuningRow
            label="Mask hardness"
            value={maskHardness}
            min={0}
            max={1}
            step={0.01}
            onChange={onMaskHardness}
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
