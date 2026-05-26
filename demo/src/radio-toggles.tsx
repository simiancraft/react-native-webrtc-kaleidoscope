// Single-select toggle group (radio semantics): at most one preset is active.
// Selecting one clears the rest, and re-pressing the active one clears it (so a
// bank can be empty). The parent owns the value, so several RadioToggles rows
// sharing one (value, onSelect) act as a single radio group spanning the rows.

import { Pressable, StyleSheet, Text, View } from 'react-native';

export type Preset<Id extends string> = { id: Id; label: string; icon?: string };

type Props<Id extends string> = {
  presets: ReadonlyArray<Preset<Id>>;
  value: Id | null;
  onSelect: (next: Id | null) => void;
  disabled?: boolean;
  // Buttons per row. 1 (default) stacks vertically; >1 wraps into a grid.
  columns?: number;
};

export const RadioToggles = <Id extends string>({
  presets,
  value,
  onSelect,
  disabled = false,
  columns = 1,
}: Props<Id>) => {
  const grid = columns > 1;
  return (
    <View style={grid ? styles.grid : styles.column}>
      {presets.map(({ id, label, icon }) => {
        const on = value === id;
        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => onSelect(on ? null : id)}
            style={[
              styles.btn,
              grid && styles.btnGrid,
              on && styles.btnOn,
              disabled && styles.btnDisabled,
            ]}
          >
            {icon ? <Text style={[styles.icon, on && styles.btnTextOn]}>{icon}</Text> : null}
            <Text style={[styles.btnText, on && styles.btnTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  column: { flexDirection: 'column', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btnGrid: { flexGrow: 1, flexBasis: '28%' },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    alignItems: 'center',
    gap: 2,
  },
  btnOn: { backgroundColor: '#4a8f3f' },
  btnDisabled: { opacity: 0.5 },
  icon: { color: '#fff', fontSize: 22, lineHeight: 26 },
  btnText: { color: '#fff', fontWeight: '500', fontSize: 13 },
  btnTextOn: { color: '#fff', fontWeight: '700' },
});
