// Zone container for the composite picker: a tab bar above the active family's
// body. Presentational only; the composite fills the zones.

import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

interface PickerLayoutProps {
  /** The family tab bar. Conventionally a row of tab buttons, one per family. */
  readonly tabsZone: ReactNode;
  /** The active family's renderer (a BackgroundGrid or a PresetOptions). */
  readonly bodyZone: ReactNode;
  /** NativeWind class for the container; resolved via the `./nativewind` interop. */
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function PickerLayout({ tabsZone, bodyZone, style }: PickerLayoutProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.tabs}>{tabsZone}</View>
      <View style={styles.body}>{bodyZone}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, width: '100%' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  body: { width: '100%' },
});
