// Public entry for the opt-in controls composition kit (subpath `./controls`).
//
// A per-form `ControlForm` micro-provider with `useField`/`makeControls`, the
// self-theming field primitives, the `ControlSection` chrome, and the
// `KaleidoscopeTuner`, all themed via `KaleidoscopeThemeProvider`. This barrel
// grows commit by commit; the theme surface lands first so later primitives can
// register against a real exported entry.

export { KaleidoscopeThemeProvider, useKaleidoscopeTheme, useThemeSlot } from './theme/provider';
export type { KaleidoscopeThemeSlots, SlotStyle, ThemeSlot } from './theme/slots';
