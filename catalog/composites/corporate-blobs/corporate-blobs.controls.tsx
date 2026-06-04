// Turnkey controls for the corporate-blobs composite. Demonstrates a per-scene
// override: the blob size (`uScale`) is narrowed to a tighter band than the
// shader's full range, via the UniformControls `overrides` prop.

import {
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
  UniformControls,
} from '../../../src/components/tuner';
import { CORPORATE_BLOBS_CONTROLS } from '../../shaders/corporate-blobs/corporate-blobs';

export function CorporateBlobsControls({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm id="blobs" uniforms={uniforms.blobs ?? {}} onPatch={onPatch} disabled={disabled}>
      <ControlSection title="blobs">
        <UniformControls
          controls={CORPORATE_BLOBS_CONTROLS}
          overrides={{ uScale: { min: 1.5, max: 3 } }}
        />
      </ControlSection>
    </ControlForm>
  );
}
