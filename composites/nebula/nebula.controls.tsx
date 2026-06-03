// Turnkey controls for the nebula composite (a single `nebula` layer).

import { NEBULA_CONTROLS } from '../../shaders/nebula/nebula';
import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControlsProps,
  UniformControls,
} from '../../src/controls';

export function NebulaControls({ uniforms, onPatch, disabled }: KaleidoscopeControlsProps) {
  return (
    <ControlForm id="nebula" uniforms={uniforms.nebula ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="nebula">
        <UniformControls controls={NEBULA_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
