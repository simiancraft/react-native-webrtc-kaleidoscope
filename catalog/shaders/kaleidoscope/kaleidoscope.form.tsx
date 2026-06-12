// Kaleidoscope's editor form: the shader OWNS its control layout (the plasma
// pattern). One <Control uniform="…"/> per uniform in declared order; layout
// or grouping changes are a local edit here. Conventional layer id:
// "kaleidoscope".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { KALEIDOSCOPE_CONTROLS } from './kaleidoscope';

export function KaleidoscopeForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="kaleidoscope"
      uniforms={uniforms.kaleidoscope ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={KALEIDOSCOPE_CONTROLS}
    >
      <ControlSection title="kaleidoscope">
        <Control uniform="uColorA" />
        <Control uniform="uColorB" />
        <Control uniform="uColorC" />
        <Control uniform="uSegments" />
        <Control uniform="uSpeed" />
        <Control uniform="uRotate" />
        <Control uniform="uZoom" />
        <Control uniform="uCalm" />
      </ControlSection>
    </ControlForm>
  );
}
