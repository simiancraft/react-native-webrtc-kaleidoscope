// Shared contract for the drop-in picker components (#28).
//
// These types are the seam between the composite picker, its family renderers,
// and the per-item leaves. The composite reads the consumer's preset book,
// flattens each preset to a `PresetView`, groups by `family` (the book entry's
// taxonomy root), and dispatches to a family-appropriate control. Selection is
// controlled: the
// component emits the chosen preset id; the host applies it via `kaleidoscope`.
//
// No runtime imports from platform-specific packages live here (it is the
// shared `.types.ts` for the platform-split resolver too); only `react` types.

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { KaleidoscopePresetBook } from '../../kaleidoscope.preset-book.types';

/**
 * A composite's family; the grouping (tab) axis. This is the book entry's
 * taxonomy root (`taxonomy[0]`, e.g. 'Worlds', 'Backgrounds').
 */
export type Family = string;

/**
 * A composite's category; the second grouping axis under a family (the
 * left-hand menu). This is the book entry's `taxonomy[1]` (e.g. 'Wizard Tower'
 * under 'Worlds', 'Office' under 'Backgrounds'). Absent for a depth-1 preset.
 */
export type Category = string;

/**
 * A preset flattened for display. `id` is the book key the picker emits and the
 * effect dispatches by; `source` is a thumbnail source (the composite's
 * `thumbnail`) when present, feeding the thumbnail tile/resolver.
 */
export interface PresetView {
  readonly id: string;
  readonly label: string;
  readonly family: Family;
  /** The preset's category (`taxonomy[1]`); undefined for a depth-1 preset. */
  readonly category?: Category | undefined;
  /**
   * Thumbnail source (web URL or native preset name as `string`, or a Metro
   * asset module id as `number`); present when the book entry has one.
   */
  readonly source?: string | number | undefined;
}

/**
 * The item's own interaction state, passed to a render-prop so a BYO tile/button
 * can reflect it. This is the leaf's interaction surface (its own selected/press
 * lifecycle), not a relayed parent-state flag.
 */
export interface PresetItemState {
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

/**
 * Render-prop for one preset tile. `uri` is the resolved thumbnail source
 * (undefined renders the recessed variant); `testID` is the tile's deterministic
 * `accessibilityIdentifier` (`kld.preset.<id>`), which a BYO tile should apply to
 * its pressable root so Maestro can address it.
 */
export type RenderTile = (
  preset: PresetView,
  state: PresetItemState & {
    readonly uri: string | number | undefined;
    readonly testID: string;
  },
) => ReactNode;

/**
 * Controlled single-selection contract shared by every picker surface. `K` is
 * the id type: the composite narrows it to `keyof P` so `value`/`onSelect` speak
 * the book's keys (no cast at the call site), matching how `kaleidoscope(cmd)`
 * narrows. Standalone primitives default `K` to `string`.
 */
export interface PresetBookMenuSelection<K extends string = string> {
  /** The selected preset id, or null when nothing is selected. */
  readonly value: K | null;
  /**
   * Emitted with the chosen id, or null when the selection is toggled off
   * (clicking the selected item clears it, mapping to `kaleidoscope(null)`).
   */
  readonly onSelect: (id: K | null) => void;
}

/** Props common to the picker surfaces; styling and templating hooks. */
export interface PresetBookMenuStyleProps {
  readonly disabled?: boolean | undefined;
  /** Container class; resolved by NativeWind via the `./nativewind` interop. */
  readonly className?: string | undefined;
  /** Override the per-preset tile rendering (BYO tile). */
  readonly renderTile?: RenderTile | undefined;
}

/** Props for the drop-in composite picker (the tabbed kitchen sink). */
export interface PresetBookMenuProps<P extends KaleidoscopePresetBook = KaleidoscopePresetBook>
  extends PresetBookMenuSelection<keyof P & string>,
    PresetBookMenuStyleProps {
  /** The consumer's preset book. */
  readonly presets: P;
  /** RN style override for the container; applied after the defaults. */
  readonly style?: StyleProp<ViewStyle> | undefined;
  /** Map a preset id to a display label; defaults to a title-cased id. */
  readonly labelFor?: ((id: keyof P & string) => string) | undefined;
  /** Label a family tab; defaults to a title-cased family name. */
  readonly tabLabelFor?: ((family: Family) => string) | undefined;
  /** Label a category menu item; defaults to the raw category string. */
  readonly categoryLabelFor?: ((category: Category) => string) | undefined;
}
