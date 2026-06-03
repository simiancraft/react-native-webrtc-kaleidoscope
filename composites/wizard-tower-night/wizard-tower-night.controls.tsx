// Turnkey controls for the wizard-tower-night composite: one ControlForm for the
// tunable clouds `sky` layer, wrapped in the shared ControlSection chrome.
// Sibling of the data module (wizard-tower-night.ts); imported only through the
// `./controls` subpath.

import { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';
import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControlsProps,
  UniformControls,
} from '../../src/controls';

export function WizardTowerNightControls({
  uniforms,
  onPatch,
  disabled,
}: KaleidoscopeControlsProps) {
  return (
    <ControlForm id="sky" uniforms={uniforms.sky ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="sky">
        <UniformControls controls={CLOUDS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
