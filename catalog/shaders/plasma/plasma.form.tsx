// Plasma's editor form: the shader OWNS its control layout. This pass just stacks
// one <Control uniform="…"/> per uniform in declared order (the auto-form's shape);
// the point is that this file exists per shader, so layout/grouping is a local edit
// here, and a new primitive flows in through <Control> without touching it.
// Conventional layer id: "plasma".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { PLASMA_CONTROLS } from './plasma';

export function PlasmaForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="plasma"
      uniforms={uniforms.plasma ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={PLASMA_CONTROLS}
    >
      <ControlSection title="plasma">
        <Control uniform="uColorA" />
        <Control uniform="uColorB" />
        <Control uniform="uSpeed" />
        <Control uniform="uScale" />
      </ControlSection>
    </ControlForm>
  );
}
