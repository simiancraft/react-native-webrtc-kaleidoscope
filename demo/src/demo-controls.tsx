// Controls for the demo's own inline presets (plasma, blur), authored the same
// way a consumer would: compose the packaged ControlForm + ControlSection +
// CompositeLayerControlPanel over the shader's exported *_CONTROLS. Referenced by id from
// the preset book (which stays .ts), so it lives in a .tsx sibling.

import { BLUR_CONTROLS, PLASMA_CONTROLS } from 'react-native-webrtc-kaleidoscope';
import {
  CompositeLayerControlPanel,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from 'react-native-webrtc-kaleidoscope/tuner';

export function PlasmaControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="plasma" uniforms={uniforms.plasma ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="plasma">
        <CompositeLayerControlPanel controls={PLASMA_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}

export function BlurControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="blur" uniforms={uniforms.blur ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="blur">
        <CompositeLayerControlPanel controls={BLUR_CONTROLS} />
      </ControlSection>
    </ControlForm>
  );
}
