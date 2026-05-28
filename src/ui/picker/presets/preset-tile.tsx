// Leaf: one background thumbnail tile. The image fills a fixed-height tile with
// the label overlaid; an optional corner badge marks a consumer-supplied preset.
//
// Fixed `height` (not `aspectRatio` derived from a percentage width) is the
// collapse fix: RN/Yoga does not derive cross-axis height from a percentage
// `flexBasis` + `aspectRatio` the way the browser does, so the demo's tiles
// rendered as thin strips. An explicit height renders reliably on every target.
//
// Styling is headless, same contract as PresetOption: defaults + `style` (wins)
// + `className` (consumed by the `./nativewind` interop, inert without it).

import {
  Image,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

interface PresetTileProps {
  readonly label: string;
  /** Resolved thumbnail URI (web URL or native file:// URI); undefined renders just the label. */
  readonly uri: string | undefined;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  /** Optional corner badge, e.g. "demo-owned". */
  readonly badge?: string;
  /** NativeWind class; resolved via the `./nativewind` interop registration. */
  readonly className?: string;
  /** RN style override; applied after the defaults. */
  readonly style?: StyleProp<ViewStyle>;
}

export function PresetTile(props: PresetTileProps) {
  const { label, uri, selected, disabled = false, onPress, badge, style } = props;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tile, selected && styles.tileSelected, disabled && styles.tileDisabled, style]}
    >
      {uri ? <Image source={{ uri }} style={styles.thumb} resizeMode="cover" /> : null}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.labelWrap}>
        <Text numberOfLines={2} style={styles.label}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const TILE_HEIGHT = 72;

const styles = StyleSheet.create({
  tile: {
    height: TILE_HEIGHT,
    minWidth: 96,
    flexGrow: 1,
    flexBasis: '30%',
    maxWidth: '32%',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#1a1a1a',
  },
  tileSelected: { borderColor: '#4a8f3f' },
  tileDisabled: { opacity: 0.5 },
  thumb: { ...StyleSheet.absoluteFillObject },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(217, 119, 6, 0.92)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  labelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 6,
  },
});
