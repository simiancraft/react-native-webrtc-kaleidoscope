// Mirror / blur on-off buttons. Owns the active-effects set and emits
// the effect list to the parent so the parent can re-derive the displayed track.

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EffectName } from 'react-native-webrtc-kaleidoscope';

type Props = {
  active: ReadonlySet<EffectName>;
  onChange: (next: ReadonlySet<EffectName>) => void;
  disabled?: boolean;
};

const EFFECTS: ReadonlyArray<EffectName> = ['mirror', 'blur'];

export const EffectToggles = ({ active, onChange, disabled = false }: Props) => {
  const toggle = useCallback(
    (name: EffectName) => {
      const next = new Set(active);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      onChange(next);
    },
    [active, onChange],
  );

  return (
    <View style={styles.row}>
      {EFFECTS.map((name) => {
        const on = active.has(name);
        return (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => toggle(name)}
            style={[styles.btn, on && styles.btnOn, disabled && styles.btnDisabled]}
          >
            <Text style={[styles.btnText, on && styles.btnTextOn]}>
              {name[0]?.toUpperCase()}
              {name.slice(1)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    alignItems: 'center',
  },
  btnOn: { backgroundColor: '#4a8f3f' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '500' },
  btnTextOn: { color: '#fff', fontWeight: '700' },
});
