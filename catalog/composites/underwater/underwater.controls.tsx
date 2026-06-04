// Turnkey controls for the underwater composite (a single godrays `rays` layer).

import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
  UniformControls,
} from '../../../src/controls';
import { GODRAYS_CONTROLS } from '../../shaders/godrays/godrays';

export function UnderwaterControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="rays" uniforms={uniforms.rays ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="rays">
        <UniformControls controls={GODRAYS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
