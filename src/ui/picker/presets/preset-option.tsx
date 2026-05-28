// Leaf: one option button for a non-image family (blur, plasma, …). Radio
// semantics; `selected`/`disabled` drive appearance through the style array,
// not buried structural ternaries.
//
// Styling is headless: RN StyleSheet defaults so it works with zero setup;
// `style` overrides (applied last, wins) for RN consumers; `className` for
// NativeWind consumers. `className` is intentionally not read in the body — the
// opt-in `./nativewind` interop registers this component with cssInterop, which
// consumes `className` at the boundary and merges the resolved styles into the
// `style` prop. With no interop registered, `className` is simply inert.

import { Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

interface PresetOptionProps {
  readonly label: string;
  readonly selected: boolean;
  readonly disabled?: boolean | undefined;
  readonly onPress: () => void;
  /** NativeWind class; resolved via the `./nativewind` interop registration. */
  readonly className?: string | undefined;
  /** RN style override; applied after the defaults. */
  readonly style?: StyleProp<ViewStyle> | undefined;
}

export function PresetOption(props: PresetOptionProps) {
  const { label, selected, disabled = false, onPress, style } = props;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.base, selected && styles.selected, disabled && styles.disabled, style]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
  },
  selected: { backgroundColor: '#4a8f3f' },
  disabled: { opacity: 0.5 },
  label: { color: '#fff', fontSize: 13, fontWeight: '500' },
  labelSelected: { fontWeight: '700' },
});
