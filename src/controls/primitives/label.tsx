// Label: a themed Text for a control's name. Reads the `label` theme slot's
// style and merges it after the default; `className` is consumed by the
// `./nativewind` cssInterop at the boundary and arrives folded into `style`.

import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import { useThemeSlot } from '../theme/provider';

export type LabelProps = {
  readonly children: ReactNode;
  /** NativeWind class; resolved via the `./nativewind` interop. */
  readonly className?: string;
  readonly style?: StyleProp<TextStyle>;
};

export function Label({ children, style }: LabelProps) {
  const { style: themeStyle } = useThemeSlot('label');
  return <Text style={[styles.label, themeStyle as StyleProp<TextStyle>, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { color: '#ccc', fontSize: 12 },
});
