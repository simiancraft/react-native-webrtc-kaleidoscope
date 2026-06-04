// CompositeLayerControlPanel: render a shader's `*_CONTROLS` descriptor list as fields,
// data-driven. This is the built-in path a composite form uses per layer:
// `<CompositeLayerControlPanel controls={CLOUDS_CONTROLS} />`. The shader owns the control
// description (its `*_CONTROLS`); this renders it with no per-shader file.
//
// KaleidoscopePreset-level customization is props: pass a filtered `controls` array to
// hide knobs, or `overrides` to narrow a control's range/label for this composite.
// `makeControls<U>()` remains the typed path for custom widgets that need a
// hand-authored, type-checked `uniform`.

import type { UniformControl } from '../../../catalog/shaders';
import { ColorPicker } from '../ui/color-picker';
import { Slider } from '../ui/slider';

/** Per-uniform range/label override, keyed by uniform name. */
export type ControlOverride = {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly label?: string;
};

export type CompositeLayerControlPanelProps = {
  readonly controls: readonly UniformControl[];
  readonly overrides?: Readonly<Record<string, ControlOverride>>;
};

export function CompositeLayerControlPanel({
  controls,
  overrides,
}: CompositeLayerControlPanelProps) {
  return (
    <>
      {controls.map((c) => {
        const o = overrides?.[c.name];
        if (c.kind === 'color') {
          return (
            <ColorPicker key={c.name} uniform={c.name} label={o?.label ?? c.label ?? c.name} />
          );
        }
        return (
          <Slider
            key={c.name}
            uniform={c.name}
            min={o?.min ?? c.min}
            max={o?.max ?? c.max}
            step={o?.step ?? c.step}
            label={o?.label ?? c.label ?? c.name}
          />
        );
      })}
    </>
  );
}
