// Switch: a self-wiring boolean field for `kind: 'switch'` uniforms (0/1). Reads
// and writes its uniform via `useField`, the same contract as Slider/ColorPicker.

import { Switch as RNSwitch, StyleSheet, View } from 'react-native';
import { useField } from '../form/use-field';
import { Label } from './label';

export type SwitchProps = {
  /** The uniform key this switch drives (0 = off, 1 = on). */
  readonly uniform: string;
  /** Display name; defaults to the uniform key. */
  readonly label?: string;
};

export function Switch({ uniform, label }: SwitchProps) {
  const field = useField(uniform);
  const on = (typeof field.value === 'number' ? field.value : 0) > 0.5;
  const name = label ?? uniform;
  return (
    <View style={styles.row}>
      <Label>{name}</Label>
      <RNSwitch
        testID={field.testID}
        accessibilityLabel={name}
        value={on}
        disabled={field.disabled}
        onValueChange={(v) => field.onChange(v ? 1 : 0)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
});
