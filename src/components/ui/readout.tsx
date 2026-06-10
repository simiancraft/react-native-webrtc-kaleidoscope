// Readout: a themed Text for a control's current value (distinct slot from the
// label, and named `readout` to avoid colliding with a control's mutating value).

import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import { useThemeSlot } from '../theme/provider';

export type ReadoutProps = {
  readonly children: ReactNode;
  /** NativeWind class; resolved via the `./nativewind` interop. */
  readonly className?: string;
  readonly style?: StyleProp<TextStyle>;
};

export function Readout({ children, style }: ReadoutProps) {
  const { style: themeStyle } = useThemeSlot('readout');
  return (
    <Text style={[styles.readout, themeStyle as StyleProp<TextStyle>, style]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  readout: { color: '#8888ff', fontSize: 12, fontVariant: ['tabular-nums'] },
});
