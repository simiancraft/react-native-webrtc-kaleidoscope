// Fireflies' editor form: the shader OWNS its control layout. This pass just stacks
// one <Control uniform="…"/> per uniform in declared order (the auto-form's shape);
// the point is that this file exists per shader, so layout/grouping is a local edit
// here, and a new primitive flows in through <Control> without touching it.
// Conventional layer id: "fireflies".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { FIREFLIES_CONTROLS } from './fireflies';

export function FirefliesForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="fireflies"
      uniforms={uniforms.fireflies ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={FIREFLIES_CONTROLS}
    >
      <ControlSection title="fireflies">
        <Control uniform="uGlowSize" />
        <Control uniform="uDotSize" />
        <Control uniform="uSpeed" />
        <Control uniform="uTwinkle" />
        <Control uniform="uColor" />
      </ControlSection>
    </ControlForm>
  );
}
