// Turnkey controls for the underwater composite (a single godrays `rays` layer).

import {
  CompositeLayerControlPanel,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { GODRAYS_CONTROLS } from '../../shaders/godrays/godrays';

export function UnderwaterControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="rays" uniforms={uniforms.rays ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="rays">
        <CompositeLayerControlPanel controls={GODRAYS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
