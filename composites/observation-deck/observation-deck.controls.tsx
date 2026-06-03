// Turnkey controls for the observation-deck composite: a simianlights `field`
// plus an anamorphic-lensflare `flare`, each its own ControlForm.

import { ANAMORPHIC_LENSFLARE_CONTROLS } from '../../shaders/anamorphic-lensflare/anamorphic-lensflare';
import { SIMIANLIGHTS_CONTROLS } from '../../shaders/simianlights/simianlights';
import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControlsProps,
  UniformControls,
} from '../../src/controls';

export function ObservationDeckControls({
  uniforms,
  onPatch,
  disabled,
}: KaleidoscopeControlsProps) {
  return (
    <>
      <ControlForm id="field" uniforms={uniforms.field ?? {}} onPatch={onPatch} disabled={disabled}>
        <ControlSection title="field">
          <UniformControls controls={SIMIANLIGHTS_CONTROLS} />
        </ControlSection>
      </ControlForm>
      <ControlForm id="flare" uniforms={uniforms.flare ?? {}} onPatch={onPatch} disabled={disabled}>
        <ControlSection title="flare">
          <UniformControls controls={ANAMORPHIC_LENSFLARE_CONTROLS} />
        </ControlSection>
      </ControlForm>
    </>
  );
}
