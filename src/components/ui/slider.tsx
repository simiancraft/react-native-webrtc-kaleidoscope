// Slider: a self-wiring scalar field. Reads/writes its uniform via `useField`
// (so the thumb tracks the drag synchronously; only the ControlForm's emit
// debounces), and pairs the slider with a typed number input so you can drag OR
// type/paste an exact value. Renders its own label, themes via the `slider` slot.

import RNSlider from '@react-native-community/slider';
import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, TextInput, View } from 'react-native';
import { useField } from '../form/use-field';
import { useThemeSlot } from '../theme/provider';
import { Label } from './label';
import { SLIDER_TINTS, safeSliderValue } from './slider-value';

const fmt = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '0');

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

  // The number input holds its own draft text so partial entries ("0.", "-") and
  // pastes survive; the slider writes the draft too, so dragging keeps it in sync.
  // A preset switch remounts the form, so the draft re-seeds from the new value.
  const [draft, setDraft] = useState(() => fmt(value));

  const fromSlider = (v: number) => {
    setDraft(fmt(v));
    field.onChange(v);
  };
  const fromText = (t: string) => {
    setDraft(t);
    const v = Number.parseFloat(t);
    if (Number.isFinite(v)) field.onChange(Math.min(max, Math.max(min, v)));
  };

  return (
    <View style={[styles.row, themeStyle as StyleProp<ViewStyle>, style]}>
      <View style={styles.line}>
        <Label>{name}</Label>
        <TextInput
          style={styles.num}
          testID={field.testID ? `${field.testID}.num` : undefined}
          accessibilityLabel={`${name} value`}
          value={draft}
          keyboardType="numeric"
          editable={!field.disabled}
          selectTextOnFocus
          onChangeText={fromText}
        />
      </View>
      <RNSlider
        style={styles.slider}
        testID={field.testID}
        accessibilityLabel={name}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={safeSliderValue(value)}
        disabled={field.disabled}
        onValueChange={fromSlider}
        {...SLIDER_TINTS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: {
    minWidth: 56,
    color: '#8888ff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    paddingVertical: 0,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(136,136,255,0.4)',
    borderRadius: 3,
  },
  slider: { width: '100%', height: 32 },
});
