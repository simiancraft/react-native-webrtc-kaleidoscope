// Anamorphic-lensflare's editor form: the shader OWNS its control layout. This pass
// just stacks one <Control uniform="…"/> per uniform in declared order (the
// auto-form's shape); the point is that this file exists per shader, so
// layout/grouping is a local edit here, and a new primitive flows in through
// <Control> without touching it. Conventional layer id: "flare".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { ANAMORPHIC_LENSFLARE_CONTROLS } from './anamorphic-lensflare';

export function AnamorphicLensflareForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="flare"
      uniforms={uniforms.flare ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={ANAMORPHIC_LENSFLARE_CONTROLS}
    >
      <ControlSection title="anamorphic flare">
        <Control uniform="uFlareX" />
        <Control uniform="uFlareY" />
        <Control uniform="uIntensity" />
        <Control uniform="uStreakLength" />
        <Control uniform="uStreakWidth" />
        <Control uniform="uGhostStrength" />
        <Control uniform="uWarmColor" />
        <Control uniform="uBlueColor" />
        <Control uniform="uPinkColor" />
      </ControlSection>
    </ControlForm>
  );
}
