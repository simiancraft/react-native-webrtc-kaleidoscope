// Outrun-grid's editor form: the shader OWNS its control layout (the plasma
// pattern). One <Control uniform="…"/> per uniform in declared order.
// Conventional layer id: "outrun-grid".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { OUTRUN_GRID_CONTROLS } from './outrun-grid';

export function OutrunGridForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="outrun-grid"
      uniforms={uniforms['outrun-grid'] ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={OUTRUN_GRID_CONTROLS}
    >
      <ControlSection title="outrun-grid">
        <Control uniform="uSkyTop" />
        <Control uniform="uSkyHorizon" />
        <Control uniform="uSunTop" />
        <Control uniform="uSunBottom" />
        <Control uniform="uGridColor" />
        <Control uniform="uGridDensity" />
        <Control uniform="uGridGlow" />
        <Control uniform="uSpeed" />
        <Control uniform="uSunSize" />
        <Control uniform="uSunBands" />
        <Control uniform="uHorizon" />
        <Control uniform="uCalm" />
      </ControlSection>
    </ControlForm>
  );
}
