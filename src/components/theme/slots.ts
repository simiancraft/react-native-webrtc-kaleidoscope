// The controls theme slot bank: one className + style pair per primitive
// component and per interaction state. A primitive reads its slot via
// `useThemeSlot` and merges it AFTER its built-in defaults (local props win).
//
// Leaf module: imports only react-native types, nothing from sibling `controls/`
// modules or from `ui/`, so `ui/` can read the theme without an import cycle.

import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from 'react-native';

/** A style value for any slot (container, text, or image targets). */
export type SlotStyle = StyleProp<ViewStyle | TextStyle | ImageStyle>;

/** Semantic slot names: one per primitive component, one per interaction state. */
export type ThemeSlot =
  | 'label'
  | 'readout'
  | 'slider'
  | 'colorPicker'
  | 'button'
  | 'tabs'
  | 'tile'
  | 'section'
  | 'active'
  | 'inactive'
  | 'disabled';

/**
 * The theme bank: a `<slot>ClassName` (resolved by the `./nativewind` interop)
 * and a `<slot>Style` (the always-works RN fallback) per slot. All optional; an
 * unset slot falls back to the primitive's built-in default. `readout` is the
 * value display (named distinctly from a control's mutating `value`).
 */
export type KaleidoscopeThemeSlots = {
  readonly [S in ThemeSlot as `${S}ClassName`]?: string;
} & {
  readonly [S in ThemeSlot as `${S}Style`]?: SlotStyle;
};
