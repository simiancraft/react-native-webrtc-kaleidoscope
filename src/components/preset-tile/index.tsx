// Leaf: one preset tile. The single item shape for every family; it prints the
// label and, if the preset has a resolved thumbnail, paints it as a wallpaper
// behind the label; with no thumbnail it is a recessed pressable button of the
// SAME footprint, so a thumbnail-less preset never breaks the grid's flow. The
// variant is chosen per preset by `uri` presence, not by family. Hover/press
// "light up" via an overlay sheet (web hover is inert on native, where
// `hovered` is simply undefined).
//
// The tile is a fixed 16:9 box (`aspectRatio`), matching the 1280x720 images and
// 320x180 thumbnails, so cover-fit shows the whole image and every tile is the
// same shape regardless of how wide a column resolves to. Width comes from the
// flex row (`flexBasis`/`maxWidth`); `aspectRatio` derives the height from it.
// (Historical note: an earlier attempt rendered thin strips when Yoga failed to
// derive height from a percentage `flexBasis` + `aspectRatio`; if that recurs on
// a target, restore an explicit `height` floor here.)
//
// Styling is headless: defaults + `style` (wins) + `className` (consumed by the
// `./nativewind` interop, inert without it).

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
  /**
   * Resolved thumbnail source. A `string` is a URL (web) or file:// URI (native
   * preset-name lookup); a `number` is a Metro asset module id consumed directly
   * by `<Image source={number}>`. Undefined renders the recessed button.
   */
  readonly uri: string | number | undefined;
  readonly selected: boolean;
  readonly disabled?: boolean | undefined;
  readonly onPress: () => void;
  /** Optional corner badge, e.g. "demo-owned". */
  readonly badge?: string | undefined;
  /** NativeWind class; resolved via the `./nativewind` interop registration. */
  readonly className?: string | undefined;
  /** RN style override; applied after the defaults. */
  readonly style?: StyleProp<ViewStyle> | undefined;
  /** Deterministic `accessibilityIdentifier` (`kld.preset.<id>`). */
  readonly testID?: string | undefined;
}

export function PresetTile(props: PresetTileProps) {
  const { label, uri, selected, disabled = false, onPress, badge, style, testID } = props;
  const hasWallpaper = !!uri;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.tile,
        hasWallpaper ? styles.wallpaper : styles.recessed,
        selected && styles.selected,
        disabled && styles.disabled,
        style,
      ]}
    >
      {({ pressed, hovered = false }: { pressed: boolean; hovered?: boolean }) => (
        <>
          {hasWallpaper ? (
            <Image
              source={typeof uri === 'number' ? uri : { uri }}
              style={styles.thumb}
              resizeMode="cover"
            />
          ) : null}
          {hasWallpaper ? <View style={styles.scrim} /> : null}
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
          {hovered || pressed ? (
            <View pointerEvents="none" style={[styles.glow, pressed && styles.glowPressed]} />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    aspectRatio: 16 / 9,
    minWidth: 96,
    // GENERAL React Native gotcha worth naming, because it bites LLM-generated
    // layouts in particular: Yoga (RN's flex engine) will silently collapse a
    // view to zero height when the layout describes height purely by derivation
    // (a percentage `flexBasis` plus an `aspectRatio`, or content that has not
    // measured yet) without an explicit floor. It smashes shut like an
    // unbroken IE6 `<div>`. If a row of tiles ever renders as thin strips, the
    // first thing to check is whether each tile has a `height` or `minHeight`
    // anywhere in its chain.
    //
    // THIS SITE: declared `flexBasis: '30%'` + `aspectRatio: 16/9` and no
    // height floor; each tile resolved to 118 x 4 px on iOS (Maestro hierarchy
    // bounds), turning every wallpaper tile into a thin gray strip. The
    // recessed variant survived only because its visible 2px border made the
    // 4px collapse read as a deliberate divider. 54 = 96 * 9 / 16 (the
    // minWidth's aspect-derived height), so a tile whose width grows past the
    // floor still tracks the 16:9 ratio via `aspectRatio`.
    minHeight: 54,
    flexGrow: 1,
    flexBasis: '30%',
    maxWidth: '32%',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // Wallpaper variant: the thumbnail fills the tile, label over a legibility scrim.
  wallpaper: { backgroundColor: '#1a1a1a' },
  // Recessed variant (no thumbnail): a pressable inset area, same footprint.
  recessed: { backgroundColor: '#242424', borderColor: '#333' },
  selected: { borderColor: '#4a8f3f' },
  disabled: { opacity: 0.5 },
  thumb: { ...StyleSheet.absoluteFillObject },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
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
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  // Hover/press "lights up": a translucent sheet over the whole tile.
  glow: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  glowPressed: { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
});
