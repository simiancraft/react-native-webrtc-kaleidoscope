// Turnkey controls for the simianlights composite (a single `field` layer).

import { SIMIANLIGHTS_CONTROLS } from '../../shaders/simianlights/simianlights';
import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControlsProps,
  UniformControls,
} from '../../src/controls';

export function SimianlightsControls({ uniforms, onPatch, disabled }: KaleidoscopeControlsProps) {
  return (
    <ControlForm id="field" uniforms={uniforms.field ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="field">
        <UniformControls controls={SIMIANLIGHTS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
