// MaskControlPanel: the segmentation-edge panel, themed and controlled.
// Either slider emits the full MaskInput (the mask verb is absolute). Not a
// layer form, so it has no ControlForm (and thus no copy button) and uses the
// raw slider directly with the themed Label/Readout primitives.

import RNSlider from '@react-native-community/slider';
import { StyleSheet, View } from 'react-native';
import type { MaskInput } from '../../kaleidoscope/types';
import { MASK_TESTID_PREFIX } from '../../lib/test-id';
import { Label } from '../ui/label';
import { Readout } from '../ui/readout';
import { SLIDER_TINTS } from '../ui/slider-value';
import { ControlSection } from './control-section';

export type MaskControlPanelProps = {
  readonly hardness: number;
  readonly threshold: number;
  readonly onChange: (mask: MaskInput) => void;
  readonly disabled?: boolean;
  /** Root for this instance's test ids; override when a screen mounts two. */
  readonly testIDPrefix?: string;
};

function MaskRow({
  label,
  value,
  disabled,
  onChange,
  testID,
}: {
  readonly label: string;
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (v: number) => void;
  readonly testID: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.line}>
        <Label>{label}</Label>
        <Readout>{value.toFixed(2)}</Readout>
      </View>
      <RNSlider
        style={styles.slider}
        testID={testID}
        accessibilityLabel={label}
        // Floor at 0.01: at exactly 0 the mask smoothstep range collapses
        // (lo === hi) and the edge breaks. 0.01 keeps it well-defined. This is a
        // shader-math floor, distinct from the field slider's web-crash epsilon.
        minimumValue={0.01}
        maximumValue={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        {...SLIDER_TINTS}
      />
    </View>
  );
}

export function MaskControlPanel({
  hardness,
  threshold,
  onChange,
  disabled = false,
  testIDPrefix = MASK_TESTID_PREFIX,
}: MaskControlPanelProps) {
  return (
    <ControlSection title="mask">
      <MaskRow
        label="hardness"
        value={hardness}
        disabled={disabled}
        onChange={(v) => onChange({ hardness: v, threshold })}
        testID={`${testIDPrefix}.hardness`}
      />
      <MaskRow
        label="threshold"
        value={threshold}
        disabled={disabled}
        onChange={(v) => onChange({ hardness, threshold: v })}
        testID={`${testIDPrefix}.threshold`}
      />
    </ControlSection>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slider: { width: '100%', height: 32 },
});
