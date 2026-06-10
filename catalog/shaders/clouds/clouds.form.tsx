// Clouds' editor form: the shader OWNS its control layout. This pass just stacks
// one <Control uniform="…"/> per uniform in declared order (the auto-form's shape);
// the point is that this file exists per shader, so layout/grouping is a local edit
// here, and a new primitive flows in through <Control> without touching it.
// Conventional layer id: "sky".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { CLOUDS_CONTROLS } from './clouds';

export function CloudsForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="sky"
      uniforms={uniforms.sky ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={CLOUDS_CONTROLS}
    >
      <ControlSection title="sky">
        <Control uniform="uSkyLowColor" />
        <Control uniform="uSkyHighColor" />
        <Control uniform="uCloudLightColor" />
        <Control uniform="uCloudDarkColor" />
        <Control uniform="uExposure" />
        <Control uniform="uStepSize" />
        <Control uniform="uCloudSpeed" />
        <Control uniform="uCloudScale" />
        <Control uniform="uDensity" />
        <Control uniform="uCoverage" />
        <Control uniform="uSoftness" />
      </ControlSection>
    </ControlForm>
  );
}
