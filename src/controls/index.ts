// Public entry for the opt-in controls composition kit (subpath `./controls`).
//
// A per-form `ControlForm` micro-provider with `useField`/`makeControls`, the
// self-theming field primitives, the `ControlSection` chrome, and the
// `KaleidoscopeTuner`, all themed via `KaleidoscopeThemeProvider`. This barrel
// grows commit by commit; the theme surface lands first so later primitives can
// register against a real exported entry.

export type { KaleidoscopeControls } from '../kaleidoscope.preset-book.types';
export { ControlSection, type ControlSectionProps } from './control-section';
export { ControlForm, type ControlFormProps, type FieldValue } from './form/control-form';
export { makeControls } from './form/make-controls';
export { type Field, useField } from './form/use-field';
export {
  KaleidoscopeMaskControls,
  type KaleidoscopeMaskControlsProps,
} from './mask-controls';
export * from './primitives';
export { KaleidoscopeThemeProvider, useKaleidoscopeTheme, useThemeSlot } from './theme/provider';
export type { KaleidoscopeThemeSlots, SlotStyle, ThemeSlot } from './theme/slots';
export {
  KaleidoscopeTransformControls,
  type KaleidoscopeTransformControlsProps,
} from './transform-controls';
export { KaleidoscopeTuner, type KaleidoscopeTunerProps } from './tuner';
export {
  type ControlOverride,
  UniformControls,
  type UniformControlsProps,
} from './uniform-controls';
