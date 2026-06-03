// Turnkey controls for the underwater composite (a single godrays `rays` layer).

import { GODRAYS_CONTROLS } from '../../shaders/godrays/godrays';
import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControlsProps,
  UniformControls,
} from '../../src/controls';

export function UnderwaterControls({ uniforms, onPatch, disabled }: KaleidoscopeControlsProps) {
  return (
    <ControlForm id="rays" uniforms={uniforms.rays ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="rays">
        <UniformControls controls={GODRAYS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
