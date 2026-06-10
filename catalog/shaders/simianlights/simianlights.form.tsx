// Simianlights' editor form: the shader OWNS its control layout. This pass just
// stacks one <Control uniform="…"/> per uniform in declared order (the auto-form's
// shape); the point is that this file exists per shader, so layout/grouping is a
// local edit here, and a new primitive flows in through <Control> without touching
// it. Conventional layer id: "field".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { SIMIANLIGHTS_CONTROLS } from './simianlights';

export function SimianlightsForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="field"
      uniforms={uniforms.field ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={SIMIANLIGHTS_CONTROLS}
    >
      <ControlSection title="simianlights">
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
