// Turnkey controls for the nebula composite (a single `nebula` layer).

import {
  CompositeLayerControlPanel,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { NEBULA_CONTROLS } from '../../shaders/nebula/nebula';

export function NebulaControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="nebula" uniforms={uniforms.nebula ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="nebula">
        <CompositeLayerControlPanel controls={NEBULA_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
