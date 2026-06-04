// Turnkey controls for the nebula composite (a single `nebula` layer).

import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
  UniformControls,
} from '../../../src/components/tuner';
import { NEBULA_CONTROLS } from '../../shaders/nebula/nebula';

export function NebulaControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="nebula" uniforms={uniforms.nebula ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="nebula">
        <UniformControls controls={NEBULA_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
