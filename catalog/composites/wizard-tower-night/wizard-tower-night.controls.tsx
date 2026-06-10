// Turnkey controls for the wizard-tower-night composite: one ControlForm for the
// tunable clouds `sky` layer, wrapped in the shared ControlSection chrome.
// Sibling of the data module (wizard-tower-night.ts); imported only through the
// `./controls` subpath.

import {
  CompositeLayerControlPanel,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';

export function WizardTowerNightControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="sky" uniforms={uniforms.sky ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="sky">
        <CompositeLayerControlPanel controls={CLOUDS_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
