// Turnkey controls for the clouds composite (a single clouds `sky` layer).

import { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';
import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControlsProps,
  UniformControls,
} from '../../src/controls';

export function CloudsControls({ uniforms, onPatch, disabled }: KaleidoscopeControlsProps) {
  return (
    <ControlForm id="sky" uniforms={uniforms.sky ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="sky">
        <UniformControls controls={CLOUDS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
