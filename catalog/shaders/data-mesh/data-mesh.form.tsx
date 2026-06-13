// Data-mesh's editor form: the shader OWNS its control layout. One
// <Control uniform="…"/> per uniform; grouped into palette / surface / glow
// sections so the big color levers, the structural dials, and the additive extras
// read as three clusters. A new primitive flows in through <Control> without
// touching this file. Conventional layer id: "mesh".

import {
  Control,
  ControlForm,
  ControlSection,
  type KaleidoscopeControls,
} from '../../../src/components/preset-control-panel';
import { DATA_MESH_CONTROLS } from './data-mesh';

export function DataMeshForm({ uniforms, onPatch, disabled }: KaleidoscopeControls) {
  return (
    <ControlForm
      id="mesh"
      uniforms={uniforms.mesh ?? {}}
      onPatch={onPatch}
      disabled={disabled}
      controls={DATA_MESH_CONTROLS}
    >
      <ControlSection title="palette">
        <Control uniform="uBgTop" />
        <Control uniform="uBgBottom" />
        <Control uniform="uLineColor" />
        <Control uniform="uCrestColor" />
        <Control uniform="uHazeColor" />
        <Control uniform="uAccentColor" />
      </ControlSection>
      <ControlSection title="surface">
        <Control uniform="uWaveScale" />
        <Control uniform="uWaveAmp" />
        <Control uniform="uWaveSpeed" />
        <Control uniform="uGridX" />
        <Control uniform="uHorizon" />
        <Control uniform="uFarScale" />
        <Control uniform="uSlant" />
        <Control uniform="uLineWidth" />
        <Control uniform="uNodeMix" />
        <Control uniform="uStrutMix" />
      </ControlSection>
      <ControlSection title="glow">
        <Control uniform="uGlow" />
        <Control uniform="uHaze" />
        <Control uniform="uParticles" />
        <Control uniform="uAccent" />
        <Control uniform="uCalm" />
      </ControlSection>
    </ControlForm>
  );
}
