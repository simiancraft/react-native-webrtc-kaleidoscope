// KaleidoscopeTransformControls: absolute flip + 90-degree rotation, themed and
// controlled. Every change emits the full TransformInput (the transform verb is
// absolute). Toggles read the `active` theme slot for their on state.

import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TransformInput } from '../kaleidoscope/types';
import { ControlSection } from './control-section';
import { useThemeSlot } from './theme/provider';

const ROTATIONS = [0, 90, 180, 270] as const;

export type KaleidoscopeTransformControlsProps = {
  readonly flip?: { readonly x?: boolean; readonly y?: boolean };
  readonly rotate?: number;
  readonly onChange: (transform: TransformInput) => void;
  readonly disabled?: boolean;
};

function FlipToggle({
  label,
  icon,
  on,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly icon: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const { style: activeStyle } = useThemeSlot('active');
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.flip,
        on && styles.on,
        on && (activeStyle as StyleProp<ViewStyle>),
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.flipIcon}>{icon}</Text>
      <Text style={styles.flipLabel}>{label}</Text>
    </Pressable>
  );
}

export function KaleidoscopeTransformControls({
  flip,
  rotate = 0,
  onChange,
  disabled = false,
}: KaleidoscopeTransformControlsProps) {
  const x = flip?.x ?? false;
  const y = flip?.y ?? false;
  const { style: activeStyle } = useThemeSlot('active');
  return (
    <ControlSection title="transform">
      <View style={styles.flipRow}>
        <FlipToggle
          label="X"
          icon="↔"
          on={x}
          disabled={disabled}
          onPress={() => onChange({ flip: { x: !x, y }, rotate })}
        />
        <FlipToggle
          label="Y"
          icon="↕"
          on={y}
          disabled={disabled}
          onPress={() => onChange({ flip: { x, y: !y }, rotate })}
        />
      </View>
      <View style={styles.rotRow}>
        {ROTATIONS.map((deg) => {
          const on = rotate === deg;
          return (
            <Pressable
              key={deg}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled }}
              disabled={disabled}
              onPress={() => onChange({ flip: { x, y }, rotate: deg })}
              style={[
                styles.rot,
                on && styles.on,
                on && (activeStyle as StyleProp<ViewStyle>),
                disabled && styles.disabled,
              ]}
            >
              <Text style={styles.rotText}>{deg}°</Text>
            </Pressable>
          );
        })}
      </View>
    </ControlSection>
  );
}

const styles = StyleSheet.create({
  flipRow: { flexDirection: 'row', gap: 8 },
  rotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flip: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    alignItems: 'center',
    gap: 2,
  },
  rot: {
    flexGrow: 1,
    minWidth: 56,
    paddingVertical: 10,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    alignItems: 'center',
  },
  on: { backgroundColor: '#4a8f3f' },
  disabled: { opacity: 0.5 },
  flipIcon: { color: '#fff', fontSize: 22, lineHeight: 26 },
  flipLabel: { color: '#fff', fontWeight: '500', fontSize: 13 },
  rotText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
