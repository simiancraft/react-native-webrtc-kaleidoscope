// KaleidoscopeTuner: the thin, controlled editor. For the active preset it
// renders that preset's `controls` component (keyed by preset id, so a switch
// remounts and the ControlForms re-seed), handing it the per-layer baked
// uniforms and a single shared onPatch. It never calls `kaleidoscope` itself;
// the host routes onPatch into `kaleidoscope(activeId, [patch])`.

import type { ReactElement } from 'react';
import type { KaleidoscopeControlsProps, PresetBook } from '../kaleidoscope/types';
import { ControlScopeContext } from './form/scope';

export type KaleidoscopeTunerProps<P extends PresetBook> = {
  readonly presets: P;
  /** The active preset id, or null when nothing is selected. */
  readonly value: (keyof P & string) | null;
  /** Routed to the host, which applies it via `kaleidoscope(value, [patch])`. */
  readonly onPatch: KaleidoscopeControlsProps['onPatch'];
  readonly disabled?: boolean;
};

export function KaleidoscopeTuner<P extends PresetBook>({
  presets,
  value,
  onPatch,
  disabled = false,
}: KaleidoscopeTunerProps<P>): ReactElement | null {
  if (value === null) return null;
  const preset = presets[value];
  const Controls = preset?.controls;
  if (!Controls) return null;

  // Per-layer baked uniforms keyed by id, for the controls component to seed each
  // layer's ControlForm. Only tunable layers carry uniforms.
  const uniforms: Record<string, Record<string, number | readonly number[]>> = {};
  for (const layer of preset.layers) {
    if ('uniforms' in layer) {
      uniforms[layer.id] = { ...layer.uniforms } as Record<string, number | readonly number[]>;
    }
  }

  return (
    <ControlScopeContext.Provider value={value}>
      <Controls key={value} uniforms={uniforms} onPatch={onPatch} disabled={disabled} />
    </ControlScopeContext.Provider>
  );
}
