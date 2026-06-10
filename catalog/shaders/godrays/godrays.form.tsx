// Godrays' editor form: the shader OWNS its control layout. This pass just stacks
// one <Control uniform="…"/> per uniform in declared order (the auto-form's shape);
// the point is that this file exists per shader, so layout/grouping is a local edit
// here, and a new primitive flows in through <Control> without touching it.
// Conventional layer id: "rays".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { GODRAYS_CONTROLS } from './godrays';

export function GodraysForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="rays"
      uniforms={uniforms.rays ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={GODRAYS_CONTROLS}
    >
      <ControlSection title="godrays">
        <Control uniform="uLightColor" />
        <Control uniform="uRayCount" />
        <Control uniform="uRaySpeed" />
        <Control uniform="uRayIntensity" />
        <Control uniform="uRaySoftness" />
        <Control uniform="uTopGlow" />
        <Control uniform="uFadeDistance" />
        <Control uniform="uWobbleAmount" />
        <Control uniform="uWobbleSpeed" />
      </ControlSection>
    </ControlForm>
  );
}
