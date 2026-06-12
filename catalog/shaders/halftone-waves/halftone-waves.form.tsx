// Halftone-waves' editor form: the shader OWNS its control layout (the plasma
// pattern). One <Control uniform="…"/> per uniform in declared order.
// Conventional layer id: "halftone-waves".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { HALFTONE_WAVES_CONTROLS } from './halftone-waves';

export function HalftoneWavesForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="halftone-waves"
      uniforms={uniforms['halftone-waves'] ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={HALFTONE_WAVES_CONTROLS}
    >
      <ControlSection title="halftone-waves">
        <Control uniform="uPaper" />
        <Control uniform="uInk" />
        <Control uniform="uPitch" />
        <Control uniform="uDotSize" />
        <Control uniform="uWaveAmp" />
        <Control uniform="uSpeed" />
        <Control uniform="uShape" />
        <Control uniform="uAngle" />
        <Control uniform="uCalm" />
      </ControlSection>
    </ControlForm>
  );
}
