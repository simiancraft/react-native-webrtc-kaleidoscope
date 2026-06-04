// Turnkey controls for the fairy-grotto composite: a clouds `sky` plus a
// `fireflies` overlay, each its own ControlForm sharing the one onPatch. The
// fireflies form now exposes uColor (the firefly tint).

import { CLOUDS_CONTROLS } from '../../shaders/clouds/clouds';
import { FIREFLIES_CONTROLS } from '../../shaders/fireflies/fireflies';
import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
  UniformControls,
} from '../../src/controls';

export function FairyGrottoControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <>
      <ControlForm id="sky" uniforms={uniforms.sky ?? {}} onPatch={onPatch} disabled={disabled}>
        <ControlSection title="sky">
          <UniformControls controls={CLOUDS_CONTROLS} />
        </ControlSection>
      </ControlForm>
      <ControlForm
        id="fireflies"
        uniforms={uniforms.fireflies ?? {}}
        onPatch={onPatch}
        disabled={disabled}
      >
        <ControlSection title="fireflies">
          <UniformControls controls={FIREFLIES_CONTROLS} />
        </ControlSection>
      </ControlForm>
    </>
  );
}
