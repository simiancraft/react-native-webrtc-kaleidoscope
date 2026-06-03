// ControlForm: the per-layer micro-provider that owns one form's view model.
//
// It holds the synchronous local values fields read (so a slider tracks the drag
// without a host round-trip) and emits the debounced, trailing-flushed
// `onPatch({ id, uniforms })` the host routes into `kaleidoscope(activeId, [...])`.
//
// Reset is by REMOUNT, never by effect: the Tuner renders the active controls
// component keyed by preset id, so a preset switch unmounts this and a fresh
// ControlForm re-seeds from `uniforms`. There is no effect syncing state to props.

import type { ReactNode } from 'react';
import { createContext, useEffect, useReducer, useRef } from 'react';

/** One field's value: a scalar uniform or a vecN (e.g. an RGB triple). */
export type FieldValue = number | readonly number[];

type FormValues = Readonly<Record<string, FieldValue>>;

/** The live form state a field reads/writes via `useField`. */
export type ControlFormContextValue = {
  readonly values: FormValues;
  readonly setField: (key: string, value: FieldValue) => void;
  readonly disabled: boolean;
};

export const ControlFormContext = createContext<ControlFormContextValue | null>(null);

type Action = { readonly key: string; readonly value: FieldValue };

function reducer(state: FormValues, action: Action): FormValues {
  return { ...state, [action.key]: action.value };
}

export type ControlFormProps = {
  /** The layer id this form patches; the discriminator in the emitted patch. */
  readonly id: string;
  /** The layer's baked uniforms; the form seeds from these at mount. */
  readonly uniforms: FormValues;
  /** Emitted (debounced) with the layer id and the current edited uniforms. */
  readonly onPatch: (patch: { id: string; uniforms: Record<string, FieldValue> }) => void;
  /** Disables every field in the form (read by `useField`). */
  readonly disabled?: boolean;
  /** Trailing-edge debounce for the emit, in ms. 0 (default) emits per change. */
  readonly debounceMs?: number;
  readonly children: ReactNode;
};

export function ControlForm({
  id,
  uniforms,
  onPatch,
  disabled = false,
  debounceMs = 0,
  children,
}: ControlFormProps) {
  const [values, dispatch] = useReducer(reducer, uniforms);

  // Latest onPatch in a ref so the emit effect doesn't re-arm when the parent
  // passes a fresh callback each render.
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;

  // Skip the emit for the initial seed; only edits should patch.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      return;
    }
    const fire = () => onPatchRef.current({ id, uniforms: { ...values } });
    if (debounceMs <= 0) {
      fire();
      return;
    }
    const t = setTimeout(fire, debounceMs);
    return () => clearTimeout(t);
  }, [values, id, debounceMs]);

  const ctx: ControlFormContextValue = {
    values,
    setField: (key, value) => dispatch({ key, value }),
    disabled,
  };

  return <ControlFormContext.Provider value={ctx}>{children}</ControlFormContext.Provider>;
}
