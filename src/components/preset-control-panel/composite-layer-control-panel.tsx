// CompositeLayerControlPanel: render a shader's `*_CONTROLS` descriptor list as
// fields, in order, data-driven. This is the AUTO-FORM (the default when a shader
// ships no custom layout form): `<CompositeLayerControlPanel controls={CLOUDS_CONTROLS} />`.
// It maps every descriptor through the shared `dispatchControl`, so it handles
// every kind (color, float, switch, polygon) the same way `<Control>` does.
//
// KaleidoscopePreset-level customization is props: pass a filtered `controls`
// array to hide knobs, or `overrides` to narrow a control's range/label for this
// composite. For real layout (grouping, split, per-beam lists), a shader exports
// a custom form of `<Control uniform>`s instead of using this panel.

import { Fragment } from 'react';
import type { UniformControl } from '../../../catalog/shaders';
import { dispatchControl } from './control';

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

// Merge a preset override onto a descriptor. min/max/step only apply to float;
// label applies to any kind.
function withOverride(c: UniformControl, o?: ControlOverride): UniformControl {
  if (!o) return c;
  if (c.kind === 'float') {
    return {
      ...c,
      min: o.min ?? c.min,
      max: o.max ?? c.max,
      step: o.step ?? c.step,
      label: o.label ?? c.label,
    };
  }
  return o.label ? { ...c, label: o.label } : c;
}

export function CompositeLayerControlPanel({
  controls,
  overrides,
}: CompositeLayerControlPanelProps) {
  return (
    <>
      {controls.map((c) => (
        <Fragment key={c.name}>{dispatchControl(withOverride(c, overrides?.[c.name]))}</Fragment>
      ))}
    </>
  );
}
