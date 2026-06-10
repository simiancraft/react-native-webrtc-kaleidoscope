// Corporate-blobs' editor form: the shader OWNS its control layout. This pass just
// stacks one <Control uniform="…"/> per uniform in declared order (the auto-form's
// shape); the point is that this file exists per shader, so layout/grouping is a
// local edit here, and a new primitive flows in through <Control> without touching
// it. Conventional layer id: "blobs".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { CORPORATE_BLOBS_CONTROLS } from './corporate-blobs';

export function CorporateBlobsForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="blobs"
      uniforms={uniforms.blobs ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={CORPORATE_BLOBS_CONTROLS}
    >
      <ControlSection title="blobs">
        <Control uniform="uColor" />
        <Control uniform="uBlobColor1" />
        <Control uniform="uBlobColor2" />
        <Control uniform="uBlobColor3" />
        <Control uniform="uBlobColor4" />
        <Control uniform="uBlobColor5" />
        <Control uniform="uBlobColor6" />
        <Control uniform="uBlobColor7" />
        <Control uniform="uBlobColor8" />
        <Control uniform="uGlobalAlpha" />
        <Control uniform="uScale" />
        <Control uniform="uEdgePull" />
        <Control uniform="uCenterClear" />
        <Control uniform="uMotionAmount" />
        <Control uniform="uMotionSpeed" />
        <Control uniform="uEdgeSoftness" />
      </ControlSection>
    </ControlForm>
  );
}
