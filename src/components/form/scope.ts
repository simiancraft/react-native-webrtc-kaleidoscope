// ControlScopeContext: the active preset id, provided by KaleidoscopeTuner above
// the controls component so each ControlForm can compose its test-id scope
// (`kld.<preset>.<layer>`) without the per-composite forms having to thread it.
// Null when a ControlForm is rendered standalone (no Tuner); the scope then
// drops the preset segment.

import { createContext } from 'react';

export const ControlScopeContext = createContext<string | null>(null);
