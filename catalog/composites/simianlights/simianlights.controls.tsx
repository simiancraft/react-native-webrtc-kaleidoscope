// Turnkey controls for the simianlights composite (a single `field` layer).

import {
  CompositeLayerControlPanel,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { SIMIANLIGHTS_CONTROLS } from '../../shaders/simianlights/simianlights';

export function SimianlightsControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="field" uniforms={uniforms.field ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="field">
        <CompositeLayerControlPanel controls={SIMIANLIGHTS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
