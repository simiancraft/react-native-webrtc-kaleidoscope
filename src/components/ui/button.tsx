// Button: a themed Pressable + label, used for the copy button and any control
// action. Themes via the `button` slot, with the `disabled` state slot overlaid
// at the container when disabled.

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useThemeSlot } from '../theme/provider';

export type ButtonProps = {
  readonly children: ReactNode;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  /** NativeWind class; resolved via the `./nativewind` interop. */
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
  /** Deterministic `accessibilityIdentifier` for the pressable. */
  readonly testID?: string;
};

export function Button({ children, onPress, disabled = false, style, testID }: ButtonProps) {
  const { style: themeStyle } = useThemeSlot('button');
  const { style: disabledStyle } = useThemeSlot('disabled');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        themeStyle as StyleProp<ViewStyle>,
        disabled && styles.disabled,
        disabled && (disabledStyle as StyleProp<ViewStyle>),
        style,
      ]}
    >
      <Text style={styles.text}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  disabled: { opacity: 0.5 },
  text: { color: '#8888ff', fontSize: 11, fontWeight: '600' },
});
