// Blur's editor form: the shader OWNS its control layout. This pass just stacks
// one <Control uniform="…"/> per uniform in declared order (the auto-form's shape);
// the point is that this file exists per shader, so layout/grouping is a local edit
// here, and a new primitive flows in through <Control> without touching it.
// Conventional layer id: "blur".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { BLUR_CONTROLS } from './blur';

export function BlurForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="blur"
      uniforms={uniforms.blur ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={BLUR_CONTROLS}
    >
      <ControlSection title="blur">
        <Control uniform="sigma" />
      </ControlSection>
    </ControlForm>
  );
}
