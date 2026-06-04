// makeControls<U>(): the typed-factory escape from React context invariance.
// Returns the field primitives with their `uniform` prop narrowed to the keys of
// the shader's uniform type whose value matches the widget (numeric keys for the
// Slider, RGB-tuple keys for the ColorPicker). A shader fragment authors
// `const { Slider, ColorPicker } = makeControls<CloudsUniforms>()`, after which a
// typo'd or wrong-typed `uniform` is a compile error. The components still
// self-wire through the nearest ControlForm at runtime.

import type { ReactElement } from 'react';
import type { RGB } from '../../lib/primitives.types';
import { ColorPicker, type ColorPickerProps } from '../ui/color-picker';
import { Slider, type SliderProps } from '../ui/slider';

type NumericKeys<U> = { [K in keyof U]: U[K] extends number ? K : never }[keyof U];
type RgbKeys<U> = { [K in keyof U]: U[K] extends RGB ? K : never }[keyof U];

type TypedSlider<U> = (
  props: Omit<SliderProps, 'uniform'> & { readonly uniform: NumericKeys<U> & string },
) => ReactElement;

type TypedColorPicker<U> = (
  props: Omit<ColorPickerProps, 'uniform'> & { readonly uniform: RgbKeys<U> & string },
) => ReactElement;

export function makeControls<U>(): {
  readonly Slider: TypedSlider<U>;
  readonly ColorPicker: TypedColorPicker<U>;
} {
  return {
    Slider: Slider as TypedSlider<U>,
    ColorPicker: ColorPicker as TypedColorPicker<U>,
  };
}
