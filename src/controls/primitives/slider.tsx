// Slider: a self-wiring scalar field. Reads/writes its uniform via `useField`
// (so the thumb tracks the drag synchronously; only the ControlForm's emit
// debounces), renders its own label + readout, and themes via the `slider` slot.

import RNSlider from '@react-native-community/slider';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useField } from '../form/use-field';
import { useThemeSlot } from '../theme/provider';
import { Label } from './label';
import { Readout } from './readout';
import { SLIDER_TINTS, safeSliderValue } from './slider-value';

export type SliderProps = {
  /** The uniform key this slider drives (a scalar). */
  readonly uniform: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  /** Display name; defaults to the uniform key. */
  readonly label?: string;
  /** NativeWind class for the container; resolved via the `./nativewind` interop. */
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
};

export function Slider({ uniform, min, max, step = 0.01, label, style }: SliderProps) {
  const field = useField(uniform);
  const { style: themeStyle } = useThemeSlot('slider');
  const value = typeof field.value === 'number' ? field.value : 0;
  const name = label ?? uniform;
  return (
    <View style={[styles.row, themeStyle as StyleProp<ViewStyle>, style]}>
      <View style={styles.line}>
        <Label>{name}</Label>
        <Readout>{(Number.isFinite(value) ? value : 0).toFixed(2)}</Readout>
      </View>
      <RNSlider
        style={styles.slider}
        accessibilityLabel={name}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={safeSliderValue(value)}
        disabled={field.disabled}
        onValueChange={(v) => field.onChange(v)}
        {...SLIDER_TINTS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slider: { width: '100%', height: 32 },
});
