// Turnkey controls for the wizard-tower composite: one ControlForm per tunable
// layer (here just the clouds `sky`), each wrapped in the shared ControlSection
// chrome. Mounted by the Tuner; the host routes the shared onPatch into
// kaleidoscope. Sibling of the data module (wizard-tower.ts), which stays
// runtime-React-free; this is imported only through the `./controls` subpath.

import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
  UniformControls,
} from '../../../src/components/tuner';
import { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';

export function WizardTowerControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="sky" uniforms={uniforms.sky ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="sky">
        <UniformControls controls={CLOUDS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
