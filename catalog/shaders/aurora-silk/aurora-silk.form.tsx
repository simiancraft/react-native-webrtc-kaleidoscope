// Aurora-silk's editor form: the shader OWNS its control layout (the plasma
// pattern). One <Control uniform="…"/> per uniform in declared order.
// Conventional layer id: "aurora-silk".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { AURORA_SILK_CONTROLS } from './aurora-silk';

export function AuroraSilkForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="aurora-silk"
      uniforms={uniforms['aurora-silk'] ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={AURORA_SILK_CONTROLS}
    >
      <ControlSection title="aurora-silk">
        <Control uniform="uColorLow" />
        <Control uniform="uColorHigh" />
        <Control uniform="uRibbonColor" />
        <Control uniform="uRibbons" />
        <Control uniform="uSoftness" />
        <Control uniform="uAngle" />
        <Control uniform="uSpeed" />
        <Control uniform="uStyle" />
        <Control uniform="uCalm" />
      </ControlSection>
    </ControlForm>
  );
}
