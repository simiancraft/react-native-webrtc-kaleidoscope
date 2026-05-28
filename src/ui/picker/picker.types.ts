// Shared contract for the drop-in picker components (#28).
//
// These types are the seam between the composite picker, its family renderers,
// and the per-item leaves. The composite reads the consumer's preset book,
// flattens each preset to a `PresetView`, groups by `family` (the shader), and
// dispatches to a family-appropriate control. Selection is controlled: the
// component emits the chosen preset id; the host applies it via `kaleidoscope`.
//
// No runtime imports from platform-specific packages live here (it is the
// shared `.types.ts` for the platform-split resolver too); only `react` types.

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PresetBook, ShaderName } from '../../kaleidoscope/types';

/** A preset's shader family; the grouping (tab) axis. */
export type Family = ShaderName;

/**
 * A preset flattened for display. `id` is the book key the picker emits and the
 * effect dispatches by; `source` is present only for `background-image` presets
 * (a URL on web, a preset name on native) and feeds the thumbnail resolver.
 */
export interface PresetView {
  readonly id: string;
  readonly label: string;
  readonly family: Family;
  /** Background source (web URL or native preset name); present only for the image family. */
  readonly source?: string | undefined;
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

/** Render-prop for one option button (non-image families). */
export type RenderOption = (preset: PresetView, state: PresetItemState) => ReactNode;

/** Render-prop for one background tile; `uri` is the resolved thumbnail source. */
export type RenderTile = (
  preset: PresetView,
  state: PresetItemState & { readonly uri: string | undefined },
) => ReactNode;

/**
 * Controlled single-selection contract shared by every picker surface. `K` is
 * the id type: the composite narrows it to `keyof P` so `value`/`onSelect` speak
 * the book's keys (no cast at the call site), matching how `kaleidoscope(cmd)`
 * narrows. Standalone primitives default `K` to `string`.
 */
export interface PickerSelection<K extends string = string> {
  /** The selected preset id, or null when nothing is selected. */
  readonly value: K | null;
  /**
   * Emitted with the chosen id, or null when the selection is toggled off
   * (clicking the selected item clears it, mapping to `kaleidoscope(null)`).
   */
  readonly onSelect: (id: K | null) => void;
}

/** Props common to the picker surfaces; styling and templating hooks. */
export interface PickerStyleProps {
  readonly disabled?: boolean | undefined;
  /** Container class; resolved by NativeWind via the `./nativewind` interop. */
  readonly className?: string | undefined;
  /** Override the background tile rendering. */
  readonly renderTile?: RenderTile | undefined;
  /** Override the option-button rendering. */
  readonly renderOption?: RenderOption | undefined;
}

/** Props for the drop-in composite picker (the tabbed kitchen sink). */
export interface PickerProps<P extends PresetBook = PresetBook>
  extends PickerSelection<keyof P & string>,
    PickerStyleProps {
  /** The consumer's preset book. */
  readonly presets: P;
  /** RN style override for the container; applied after the defaults. */
  readonly style?: StyleProp<ViewStyle> | undefined;
  /** Map a preset id to a display label; defaults to a title-cased id. */
  readonly labelFor?: ((id: keyof P & string) => string) | undefined;
  /** Label a family tab; defaults to a title-cased family name. */
  readonly tabLabelFor?: ((family: Family) => string) | undefined;
}
