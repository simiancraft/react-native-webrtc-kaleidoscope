// Nebula's editor form: the shader OWNS its control layout. This pass just stacks
// one <Control uniform="…"/> per uniform in declared order (the auto-form's shape);
// the point is that this file exists per shader, so layout/grouping is a local edit
// here, and a new primitive flows in through <Control> without touching it.
// Conventional layer id: "nebula".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { NEBULA_CONTROLS } from './nebula';

export function NebulaForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="nebula"
      uniforms={uniforms.nebula ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={NEBULA_CONTROLS}
    >
      <ControlSection title="nebula">
        <Control uniform="uColor" />
        <Control uniform="uBrightness" />
        <Control uniform="uSpeed" />
        <Control uniform="uTwinkleSpeed" />
        <Control uniform="uScale" />
        <Control uniform="uStarGlow" />
      </ControlSection>
    </ControlForm>
  );
}
