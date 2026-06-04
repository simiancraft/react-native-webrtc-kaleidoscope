// Turnkey controls for the observation-deck composite: a simianlights `field`
// plus an anamorphic-lensflare `flare`, each its own ControlForm.

import {
  CompositeLayerControlPanel,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { ANAMORPHIC_LENSFLARE_CONTROLS } from '../../shaders/anamorphic-lensflare/anamorphic-lensflare';
import { SIMIANLIGHTS_CONTROLS } from '../../shaders/simianlights/simianlights';

export function ObservationDeckControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <>
      <ControlForm id="field" uniforms={uniforms.field ?? {}} onPatch={onPatch} disabled={disabled}>
        <ControlSection title="field">
          <CompositeLayerControlPanel controls={SIMIANLIGHTS_CONTROLS} />
        </ControlSection>
      </ControlForm>
      <ControlForm id="flare" uniforms={uniforms.flare ?? {}} onPatch={onPatch} disabled={disabled}>
        <ControlSection title="flare">
          <CompositeLayerControlPanel controls={ANAMORPHIC_LENSFLARE_CONTROLS} />
        </ControlSection>
      </ControlForm>
    </>
  );
}
