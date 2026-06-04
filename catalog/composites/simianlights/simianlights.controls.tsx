// Turnkey controls for the simianlights composite (a single `field` layer).

import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
  UniformControls,
} from '../../../src/controls';
import { SIMIANLIGHTS_CONTROLS } from '../../shaders/simianlights/simianlights';

export function SimianlightsControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="field" uniforms={uniforms.field ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="field">
        <UniformControls controls={SIMIANLIGHTS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
