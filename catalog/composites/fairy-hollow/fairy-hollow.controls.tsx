// Turnkey controls for the fairy-hollow composite: a clouds `sky` plus a
// `fireflies` overlay, each its own ControlForm sharing the one onPatch. The
// fireflies form now exposes uColor (the firefly tint).

import {
  CompositeLayerControlPanel,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';
import { FIREFLIES_CONTROLS } from '../../shaders/fireflies/fireflies';

export function FairyHollowControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <>
      <ControlForm id="sky" uniforms={uniforms.sky ?? {}} onPatch={onPatch} disabled={disabled}>
        <ControlSection title="sky">
          <CompositeLayerControlPanel controls={CLOUDS_CONTROLS} />
        </ControlSection>
      </ControlForm>
      <ControlForm
        id="fireflies"
        uniforms={uniforms.fireflies ?? {}}
        onPatch={onPatch}
        disabled={disabled}
      >
        <ControlSection title="fireflies">
          <CompositeLayerControlPanel controls={FIREFLIES_CONTROLS} />
        </ControlSection>
      </ControlForm>
    </>
  );
}
