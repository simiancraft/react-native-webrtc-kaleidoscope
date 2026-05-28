// Family renderer: the non-image families (blur, plasma, …) as a wrap row of
// option buttons. The item renderer is chosen once (the `renderOption` slot or
// the default), then mapped; no per-item ternary in the tree.

import { Fragment } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import type { PresetView, RenderOption } from '../picker.types';
import { PresetOption } from './preset-option';

interface PresetOptionsProps {
  readonly presets: ReadonlyArray<PresetView>;
  readonly value: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly disabled?: boolean;
  /** Override the option-button rendering (BYO button). */
  readonly renderOption?: RenderOption;
  /** NativeWind class for the row container; resolved via the `./nativewind` interop. */
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}

const defaultRenderOption: RenderOption = (preset, state) => (
  <PresetOption
    label={preset.label}
    selected={state.selected}
    disabled={state.disabled}
    onPress={state.onPress}
  />
);

export function PresetOptions(props: PresetOptionsProps) {
  const { presets, value, onSelect, disabled = false, renderOption, style } = props;
  const renderItem = renderOption ?? defaultRenderOption;
  return (
    <View accessibilityRole="radiogroup" style={[styles.row, style]}>
      {presets.map((preset) => {
        const selected = value === preset.id;
        return (
          <Fragment key={preset.id}>
            {renderItem(preset, {
              selected,
              disabled,
              onPress: () => onSelect(selected ? null : preset.id),
            })}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
