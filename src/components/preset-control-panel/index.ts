// Public entry for the opt-in controls composition kit (subpath `./controls`).
//
// A per-form `ControlForm` micro-provider with `useField`/`makeControls`, the
// self-theming field primitives, the `ControlSection` chrome, and the
// `PresetControlPanel`, all themed via `KaleidoscopeThemeProvider`. This barrel
// grows commit by commit; the theme surface lands first so later primitives can
// register against a real exported entry.

export type { KaleidoscopeControls } from '../../kaleidoscope.preset-book.types';
export { ControlForm, type ControlFormProps, type FieldValue } from '../form/control-form';
export { makeControls } from '../form/make-controls';
export { type Field, useField } from '../form/use-field';
export { KaleidoscopeThemeProvider, useKaleidoscopeTheme, useThemeSlot } from '../theme/provider';
export type { KaleidoscopeThemeSlots, SlotStyle, ThemeSlot } from '../theme/slots';
export * from '../ui';
export {
  CompositeLayerControlPanel,
  type CompositeLayerControlPanelProps,
  type ControlOverride,
} from './composite-layer-control-panel';
export { Control, type ControlProps, dispatchControl } from './control';
export { ControlSection, type ControlSectionProps } from './control-section';
export {
  MaskControlPanel,
  type MaskControlPanelProps,
} from './mask-control-panel';
export { PresetControlPanel, type PresetControlPanelProps } from './preset-control-panel';
export {
  TransformControlPanel,
  type TransformControlPanelProps,
} from './transform-control-panel';
