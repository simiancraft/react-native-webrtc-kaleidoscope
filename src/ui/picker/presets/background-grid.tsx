// Family renderer: the background-image family as a thumbnail grid. Same
// dispatch-once shape as PresetOptions; the tile renderer is the `renderTile`
// slot or the default.
//
// The thumbnail URI comes from the platform-split `resolveBackgroundUri`: the
// source URL on web, the in-bundle file:// URI on native.

import { Fragment, useMemo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import type { PresetView, RenderTile } from '../picker.types';
import { resolveBackgroundUri } from '../resolve-background-uri';
import { PresetTile } from './preset-tile';

interface BackgroundGridProps {
  readonly presets: ReadonlyArray<PresetView>;
  readonly value: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly disabled?: boolean;
  /** Override the tile rendering (BYO tile, e.g. to add a badge). */
  readonly renderTile?: RenderTile;
  /** NativeWind class for the grid container; resolved via the `./nativewind` interop. */
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}

const defaultRenderTile: RenderTile = (preset, state) => (
  <PresetTile
    label={preset.label}
    uri={state.uri}
    selected={state.selected}
    disabled={state.disabled}
    onPress={state.onPress}
  />
);

export function BackgroundGrid(props: BackgroundGridProps) {
  const { presets, value, onSelect, disabled = false, renderTile, style } = props;
  const renderItem = renderTile ?? defaultRenderTile;
  // Resolve thumbnail URIs once per preset set (not per render/selection); the
  // result is pure in (id, source).
  const uriById = useMemo(
    () => new Map(presets.map((p) => [p.id, resolveBackgroundUri(p.id, p.source)] as const)),
    [presets],
  );
  return (
    <View accessibilityRole="radiogroup" style={[styles.grid, style]}>
      {presets.map((preset) => {
        const selected = value === preset.id;
        return (
          <Fragment key={preset.id}>
            {renderItem(preset, {
              selected,
              disabled,
              uri: uriById.get(preset.id),
              onPress: () => onSelect(selected ? null : preset.id),
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
