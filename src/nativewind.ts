// Opt-in NativeWind integration for the picker components (subpath
// `./nativewind`). Import and call this once from your NativeWind interop setup
// (the file where you register third-party components for `className`):
//
//   import { registerKaleidoscopeNativeWind } from 'react-native-webrtc-kaleidoscope/nativewind';
//   registerKaleidoscopeNativeWind();
//
// This is the only module that imports `nativewind` (an optional peer); the
// core `./ui` components stay style-agnostic. Without this call the components
// still work via their defaults and the `style` prop; `className` is simply
// inert. `cssInterop` maps each component's `className` onto its `style` target,
// so the class string the consumer passes is resolved by their NativeWind setup.

import { cssInterop } from 'nativewind';
import { KaleidoscopePicker } from './components/picker';
import { PickerLayout } from './components/picker/layout';
import { PresetGrid } from './components/picker/presets/preset-grid';
import { PresetTile } from './components/picker/presets/preset-tile';
import { Button } from './components/ui/button';
import { ColorPicker } from './components/ui/color-picker';
import { Label } from './components/ui/label';
import { Readout } from './components/ui/readout';
import { Slider } from './components/ui/slider';

/**
 * Register the picker and control primitives with NativeWind so they accept
 * `className`. Idempotent; call once at app/interop setup. Requires the optional
 * `nativewind` peer dependency.
 */
export function registerKaleidoscopeNativeWind(): void {
  const mapping = { className: 'style' } as const;
  cssInterop(KaleidoscopePicker, mapping);
  cssInterop(PickerLayout, mapping);
  cssInterop(PresetGrid, mapping);
  cssInterop(PresetTile, mapping);
  cssInterop(Label, mapping);
  cssInterop(Readout, mapping);
  cssInterop(Slider, mapping);
  cssInterop(ColorPicker, mapping);
  cssInterop(Button, mapping);
}
