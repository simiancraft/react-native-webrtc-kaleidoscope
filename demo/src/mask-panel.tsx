// Two sliders for the segmentation mask edge. Either slider sends BOTH values
// through the one `mask({ hardness, threshold })` verb, matching the API: every
// call is the full mask state. Both are normalized 0..1.

import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  hardness: number;
  threshold: number;
  onChange: (next: { hardness: number; threshold: number }) => void;
  disabled?: boolean;
};

type RowProps = { label: string; value: number; disabled: boolean; onChange: (v: number) => void };

function Row({ label, value, disabled, onChange }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.labelLine}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value.toFixed(2)}</Text>
      </View>
      <Slider
        style={styles.slider}
        // Floor at 0.01: at exactly 0 the mask smoothstep range collapses
        // (lo === hi) and the edge breaks. 0.01 keeps it well-defined.
        minimumValue={0.01}
        maximumValue={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        minimumTrackTintColor="#8888ff"
        maximumTrackTintColor="#444"
        thumbTintColor="#eeeeff"
      />
    </View>
  );
}

export function MaskPanel({ hardness, threshold, onChange, disabled = false }: Props) {
  return (
    <View style={styles.panel}>
      <Row
        label="Hardness"
        value={hardness}
        disabled={disabled}
        onChange={(v) => onChange({ hardness: v, threshold })}
      />
      <Row
        label="Threshold"
        value={threshold}
        disabled={disabled}
        onChange={(v) => onChange({ hardness, threshold: v })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  row: { gap: 2 },
  labelLine: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#ccc', fontSize: 12 },
  value: { color: '#8888ff', fontSize: 12, fontVariant: ['tabular-nums'] },
  slider: { width: '100%', height: 32 },
});
