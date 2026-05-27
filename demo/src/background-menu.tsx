// Background picker: a thumbnail grid where each tile shows the preset image
// with its title centered over it. Single-select (radio): the parent owns the
// value, so this shares the art selection with the blur/plasma rows. Fills
// 100% of its container and wraps.
//
// This is the seed of a reusable, drop-in background menu (the library picker
// in issue #28). It currently keys off the web image URL (`source`); native
// thumbnail support (importing the raw WebP) is a later step.

import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export type BackgroundTile<Id extends string> = {
  id: Id;
  label: string;
  // Web: the bundled image URL. Native: the preset name (not yet a thumbnail).
  source: string;
  // Optional corner badge, e.g. "demo-owned" to mark a consumer-supplied image
  // (one that came through the same book/prebuild path as the library presets).
  badge?: string;
};

type Props<Id extends string> = {
  tiles: ReadonlyArray<BackgroundTile<Id>>;
  value: Id | null;
  onSelect: (next: Id | null) => void;
  disabled?: boolean;
};

export const BackgroundMenu = <Id extends string>({
  tiles,
  value,
  onSelect,
  disabled = false,
}: Props<Id>) => (
  <View style={styles.grid}>
    {tiles.map(({ id, label, source, badge }) => {
      const on = value === id;
      return (
        <Pressable
          key={id}
          accessibilityRole="radio"
          accessibilityState={{ selected: on, disabled }}
          disabled={disabled}
          onPress={() => onSelect(on ? null : id)}
          style={[styles.tile, on && styles.tileOn, disabled && styles.tileDisabled]}
        >
          <Image source={{ uri: source }} style={styles.thumb} resizeMode="cover" />
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
          <View style={styles.labelWrap}>
            <Text style={styles.label} numberOfLines={2}>
              {label}
            </Text>
          </View>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  // ~3 per row; maxWidth caps growth so a short final row keeps the same tile
  // size as full rows instead of stretching wide. 16:9 keeps them image-shaped.
  tile: {
    flexGrow: 1,
    flexBasis: '31%',
    maxWidth: '32%',
    aspectRatio: 16 / 9,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#1a1a1a',
  },
  tileOn: { borderColor: '#4a8f3f' },
  tileDisabled: { opacity: 0.5 },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(217, 119, 6, 0.92)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  thumb: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  labelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
