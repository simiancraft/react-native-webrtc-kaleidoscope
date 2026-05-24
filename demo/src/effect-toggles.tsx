// Grouped on/off toggles for a list of preset IDs. The parent decides what
// each ID maps to (an EffectSpec, in our case); this component is purely UI.
// Buttons stack vertically so a parent can lay several groups out as columns.

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Preset<Id extends string> = { id: Id; label: string; icon?: string };

type Props<Id extends string> = {
  presets: ReadonlyArray<Preset<Id>>;
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
    <View style={styles.column}>
      {presets.map(({ id, label, icon }) => {
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
