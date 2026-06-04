// Turnkey controls for the clouds composite (a single clouds `sky` layer).

import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
  UniformControls,
} from '../../../src/controls';
import { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';

export function CloudsControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="sky" uniforms={uniforms.sky ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="sky">
        <UniformControls controls={CLOUDS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
