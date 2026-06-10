// Control: place one control by uniform id inside a per-shader form. It takes
// ONLY the uniform name, resolves that uniform's descriptor from the enclosing
// ControlForm, and renders the kind's self-wiring primitive with the descriptor's
// props. Taking only the name is the invariant: a layout form can ARRANGE controls
// (wrap them in Views, group them) but cannot redefine a control's behavior.
//
// `dispatchControl` is the shared kind -> primitive map, reused by the auto-form
// (CompositeLayerControlPanel renders every descriptor) and by <Control> (renders
// one looked-up descriptor).

import type { ReactNode } from 'react';
import { useContext } from 'react';
import type { UniformControl } from '../../../catalog/shaders';
import { ControlFormContext } from '../form/control-form';
import { ColorPicker } from '../ui/color-picker';
import { PolygonField } from '../ui/polygon-field';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';

/** Render one control descriptor as its kind's self-wiring primitive. */
export function dispatchControl(c: UniformControl): ReactNode {
  const label = c.label ?? c.name;
  switch (c.kind) {
    case 'color':
      return <ColorPicker uniform={c.name} label={label} />;
    case 'float':
      return <Slider uniform={c.name} min={c.min} max={c.max} step={c.step} label={label} />;
    case 'switch':
      return <Switch uniform={c.name} label={label} />;
    case 'polygon':
      return <PolygonField uniform={c.name} points={c.points} label={label} />;
  }
}

export type ControlProps = {
  /** The uniform id to place; its descriptor is resolved from the ControlForm. */
  readonly uniform: string;
};

export function Control({ uniform }: ControlProps) {
  const ctx = useContext(ControlFormContext);
  const descriptor = ctx?.controls?.find((c) => c.name === uniform);
  if (!descriptor) {
    throw new Error(
      `<Control uniform="${uniform}"/>: no descriptor found. Pass controls={X_CONTROLS} ` +
        'to the enclosing <ControlForm>.',
    );
  }
  return dispatchControl(descriptor);
}
