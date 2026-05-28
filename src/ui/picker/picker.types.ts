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
  readonly source?: string;
}

/** Per-item interaction state handed to a render-prop. */
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

/** Controlled single-selection contract shared by every picker surface. */
export interface PickerSelection {
  /** The selected preset id, or null when nothing is selected. */
  readonly value: string | null;
  /** Emitted with the chosen id, or null when the selection is toggled off. */
  readonly onSelect: (id: string | null) => void;
}

/** Props common to the picker surfaces; styling and templating hooks. */
export interface PickerStyleProps {
  readonly disabled?: boolean;
  /** Container class; resolved by NativeWind via the `./nativewind` interop. */
  readonly className?: string;
  /** Override the background tile rendering. */
  readonly renderTile?: RenderTile;
  /** Override the option-button rendering. */
  readonly renderOption?: RenderOption;
}

/** Props for the drop-in composite picker (the tabbed kitchen sink). */
export interface PickerProps<P extends PresetBook = PresetBook>
  extends PickerSelection,
    PickerStyleProps {
  /** The consumer's preset book. */
  readonly presets: P;
  /** Map a preset id to a display label; defaults to a title-cased id. */
  readonly labelFor?: (id: string & keyof P) => string;
  /** Label a family tab; defaults to a title-cased family name. */
  readonly tabLabelFor?: (family: Family) => string;
}
