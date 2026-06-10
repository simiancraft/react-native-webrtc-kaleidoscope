// Light-beams-and-motes' editor form: the shader OWNS its control layout. The
// knobs are PACKAGED BY THING -- each beam's on/color/strength/position sit in one
// section (three beams = three sections), and the mote knobs sit in their own --
// so related controls are edited together. A beam's position is a <Control> on its
// polygon uniform, which resolves to the 2x2 Point grid. Conventional layer id:
// "beams".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { LIGHT_BEAMS_AND_MOTES_CONTROLS } from './light-beams-and-motes';

export function LightBeamsAndMotesForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="beams"
      uniforms={uniforms.beams ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={LIGHT_BEAMS_AND_MOTES_CONTROLS}
    >
      <ControlSection title="beam 1">
        <Control uniform="uBeam1On" />
        <Control uniform="uBeam1Color" />
        <Control uniform="uBeam1Alpha" />
        <Control uniform="uBeam1Poly" />
      </ControlSection>
      <ControlSection title="beam 2">
        <Control uniform="uBeam2On" />
        <Control uniform="uBeam2Color" />
        <Control uniform="uBeam2Alpha" />
        <Control uniform="uBeam2Poly" />
      </ControlSection>
      <ControlSection title="beam 3">
        <Control uniform="uBeam3On" />
        <Control uniform="uBeam3Color" />
        <Control uniform="uBeam3Alpha" />
        <Control uniform="uBeam3Poly" />
      </ControlSection>
      <ControlSection title="motes">
        <Control uniform="uMoteCount" />
        <Control uniform="uMoteAlpha" />
        <Control uniform="uGlowSize" />
      </ControlSection>
      <ControlSection title="shared">
        <Control uniform="uSpeed" />
        <Control uniform="uBeamSoftness" />
        <Control uniform="uOverlayAlpha" />
      </ControlSection>
    </ControlForm>
  );
}
