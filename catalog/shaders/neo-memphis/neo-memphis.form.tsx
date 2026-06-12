// Neo-Memphis's editor form: the shader OWNS its control layout (the plasma
// pattern). One <Control uniform="…"/> per uniform in declared order.
// Conventional layer id: "neo-memphis".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { NEO_MEMPHIS_CONTROLS } from './neo-memphis';

export function NeoMemphisForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="neo-memphis"
      uniforms={uniforms['neo-memphis'] ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={NEO_MEMPHIS_CONTROLS}
    >
      <ControlSection title="neo-memphis">
        <Control uniform="uBgColor" />
        <Control uniform="uColorA" />
        <Control uniform="uColorB" />
        <Control uniform="uColorC" />
        <Control uniform="uScale" />
        <Control uniform="uDensity" />
        <Control uniform="uOutline" />
        <Control uniform="uDrift" />
        <Control uniform="uCalm" />
      </ControlSection>
    </ControlForm>
  );
}
