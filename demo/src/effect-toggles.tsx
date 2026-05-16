// Generic on/off toggles for a list of preset IDs. The parent decides what
// each ID maps to (an EffectSpec, in our case); this component is purely UI.

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props<Id extends string> = {
  presets: ReadonlyArray<{ id: Id; label: string }>;
  active: ReadonlySet<Id>;
  onChange: (next: ReadonlySet<Id>) => void;
  disabled?: boolean;
};

export const EffectToggles = <Id extends string>({
  presets,
  active,
  onChange,
  disabled = false,
}: Props<Id>) => {
  const toggle = useCallback(
    (id: Id) => {
      const next = new Set(active);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onChange(next);
    },
    [active, onChange],
  );

  return (
    <View style={styles.row}>
      {presets.map(({ id, label }) => {
        const on = active.has(id);
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => toggle(id)}
            style={[styles.btn, on && styles.btnOn, disabled && styles.btnDisabled]}
          >
            <Text style={[styles.btnText, on && styles.btnTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    minWidth: 96,
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    alignItems: 'center',
  },
  btnOn: { backgroundColor: '#4a8f3f' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '500' },
  btnTextOn: { color: '#fff', fontWeight: '700' },
});
