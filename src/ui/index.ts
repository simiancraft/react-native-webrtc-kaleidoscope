// Public entry for the optional drop-in picker components (subpath `./ui`, #28).
//
// Headless, preset-driven React Native components: a tabbed composite plus the
// same pieces as standalone primitives. Styling is three-tiered (defaults ->
// `className` via the `./nativewind` interop -> render-prop slot). The core
// imports no `nativewind`; only the `./nativewind` subpath does.
//
// Primitives (composable, headless); the family renderers and composite follow.

export { KaleidoscopePicker, type PickerModel, usePicker } from './picker';
export { PickerLayout } from './picker/layout';
export type {
  Family,
  PickerProps,
  PickerSelection,
  PickerStyleProps,
  PresetItemState,
  PresetView,
  RenderOption,
  RenderTile,
} from './picker/picker.types';
export { BackgroundGrid } from './picker/presets/background-grid';
export { PresetOption } from './picker/presets/preset-option';
export { PresetOptions } from './picker/presets/preset-options';
export { PresetTile } from './picker/presets/preset-tile';
