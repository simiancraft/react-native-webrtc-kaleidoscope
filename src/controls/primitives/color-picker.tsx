// ColorPicker: a self-wiring vec3 field. v1 is the swatch + three channel
// sliders the demo shipped; it reads/writes a single RGB uniform via `useField`
// and emits the whole triple on any channel change. Themes via `colorPicker`.

import RNSlider from '@react-native-community/slider';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useField } from '../form/use-field';
import { useThemeSlot } from '../theme/provider';
import { Label } from './label';
import { Readout } from './readout';
import { safeSliderValue } from './slider-value';

const CH = ['R', 'G', 'B'] as const;

export type ColorPickerProps = {
  /** The uniform key this picker drives (an RGB triple). */
  readonly uniform: string;
  /** Display name; defaults to the uniform key. */
  readonly label?: string;
  /** NativeWind class for the container; resolved via the `./nativewind` interop. */
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
};

export function ColorPicker({ uniform, label, style }: ColorPickerProps) {
  const field = useField(uniform);
  const { style: themeStyle } = useThemeSlot('colorPicker');
  const rgb = Array.isArray(field.value) ? field.value : [0, 0, 0];
  const r = rgb[0] ?? 0;
  const g = rgb[1] ?? 0;
  const b = rgb[2] ?? 0;
  const swatch = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  const name = label ?? uniform;
  const setChannel = (i: number, v: number) => {
    const next = [r, g, b];
    next[i] = v;
    field.onChange(next);
  };
  return (
    <View style={[styles.row, themeStyle as StyleProp<ViewStyle>, style]}>
      <View style={styles.labelWrap}>
        <View style={[styles.swatch, { backgroundColor: swatch }]} />
        <Label>{name}</Label>
      </View>
      {[r, g, b].map((v, i) => (
        <View key={CH[i]} style={styles.chanLine}>
          <Readout>{CH[i]}</Readout>
          <RNSlider
            style={styles.chanSlider}
            accessibilityLabel={`${name} ${CH[i]}`}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={safeSliderValue(v)}
            disabled={field.disabled}
            onValueChange={(nv) => setChannel(i, nv)}
            minimumTrackTintColor="#8888ff"
            maximumTrackTintColor="#444"
            thumbTintColor="#eeeeff"
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 2, borderWidth: 1, borderColor: '#555' },
  chanLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chanSlider: { flex: 1, height: 28 },
});
