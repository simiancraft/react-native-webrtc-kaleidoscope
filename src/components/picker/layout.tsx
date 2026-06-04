// Zone container for the composite picker: a tab bar above, then (when the
// active family has categories) a left-hand category menu beside the body.
// Presentational only; the composite fills the zones.

import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

interface PickerLayoutProps {
  /**
   * The family tab bar; conventionally a row of tab buttons, one per family.
   * The layout already wraps this in a `tablist`-role row with flex/gap, so the
   * filler should be the bare tab elements (don't add another row wrapper).
   */
  readonly tabsZone: ReactNode;
  /**
   * The category menu for the active family (a column of buttons, one per
   * category). Omit (or pass nothing) for a flat family: the body then spans
   * full width with no left column. The layout wraps this in the left column;
   * the filler should be the bare item elements.
   */
  readonly sidebarZone?: ReactNode;
  /** The active family's renderer (a PresetGrid); fills the body column. */
  readonly bodyZone: ReactNode;
  /** NativeWind class for the container; resolved via the `./nativewind` interop. */
  readonly className?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

// `className` is consumed by the ./nativewind cssInterop at the boundary and
// arrives merged into `style`, so it is not destructured/read here.
export function PickerLayout({ tabsZone, sidebarZone, bodyZone, style }: PickerLayoutProps) {
  return (
    <View style={[styles.container, style]}>
      <View accessibilityRole="tablist" accessibilityLabel="Effect families" style={styles.tabs}>
        {tabsZone}
      </View>
      {sidebarZone ? (
        <View style={styles.split}>
          <View accessibilityRole="menu" accessibilityLabel="Categories" style={styles.sidebar}>
            {sidebarZone}
          </View>
          <View style={styles.bodyFlex}>{bodyZone}</View>
        </View>
      ) : (
        <View style={styles.body}>{bodyZone}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, width: '100%' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  split: { flexDirection: 'row', gap: 12, width: '100%', alignItems: 'flex-start' },
  sidebar: { flexShrink: 0, gap: 4, minWidth: 96 },
  bodyFlex: { flex: 1 },
  body: { width: '100%' },
});
