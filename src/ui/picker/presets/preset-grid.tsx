// Family renderer: one family's presets as a uniform tile grid. Every family
// renders through this — the per-preset tile decides wallpaper-vs-recessed by
// whether it has a resolved thumbnail, so a family with no thumbnails just
// renders recessed buttons of the same footprint. The tile renderer is the
// `renderTile` slot or the default.
//
// The thumbnail URI comes from the platform-split `resolveBackgroundUri`: the
// source URL on web, the in-bundle file:// URI on native; undefined for a preset
// with no thumbnail (the tile then renders its recessed variant).

import { Fragment, useMemo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { presetTileTestId } from '../../../test-id';
import type { PresetView, RenderTile } from '../picker.types';
import { resolveBackgroundUri } from '../resolve-background-uri';
import { PresetTile } from './preset-tile';

interface PresetGridProps {
  readonly presets: ReadonlyArray<PresetView>;
  readonly value: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly disabled?: boolean | undefined;
  /** Override the tile rendering (BYO tile, e.g. to add a badge). */
  readonly renderTile?: RenderTile | undefined;
  /** NativeWind class for the grid container; resolved via the `./nativewind` interop. */
  readonly className?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

const defaultRenderTile: RenderTile = (preset, state) => (
  <PresetTile
    label={preset.label}
    uri={state.uri}
    selected={state.selected}
    disabled={state.disabled}
    onPress={state.onPress}
    testID={state.testID}
  />
);

export function PresetGrid(props: PresetGridProps) {
  const { presets, value, onSelect, disabled = false, renderTile, style } = props;
  const renderItem = renderTile ?? defaultRenderTile;
  // Resolve thumbnail URIs once per preset set (not per render/selection); the
  // result is pure in (id, source).
  // The native resolver looks the thumbnail up by id in Bundle.main. For image
  // presets the preset id and the thumbnail's bundle filename coincide (a
  // background's plate id IS its preset id); for composites they differ (the
  // composite's thumb is bundled as `<composite-id>-thumb.webp`), so pass the
  // source as the lookup key when it is a string and falls back to the preset
  // id otherwise.
  const uriById = useMemo(
    () =>
      new Map(
        presets.map((p) => {
          const lookupId = typeof p.source === 'string' ? p.source : p.id;
          return [p.id, resolveBackgroundUri(lookupId, p.source)] as const;
        }),
      ),
    [presets],
  );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Presets" style={[styles.grid, style]}>
      {presets.map((preset) => {
        const selected = value === preset.id;
        return (
          <Fragment key={preset.id}>
            {renderItem(preset, {
              selected,
              disabled,
              uri: uriById.get(preset.id),
              onPress: () => onSelect(selected ? null : preset.id),
              testID: presetTileTestId(preset.id),
            })}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
});
