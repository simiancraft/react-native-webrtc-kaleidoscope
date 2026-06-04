// Turnkey controls for the clouds composite (a single clouds `sky` layer).

import {
  CompositeLayerControlPanel,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';

export function CloudsControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="sky" uniforms={uniforms.sky ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="sky">
        <CompositeLayerControlPanel controls={CLOUDS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
