// useField: a control primitive's hook into its ControlForm. Reads the field's
// current value (synchronously, so display tracks input) and returns an onChange
// that writes back. Throws without a ControlForm ancestor, which is the contract
// that keeps shader fragments from being rendered standalone.
//
// This is the raw, loosely-typed hook; `makeControls<U>()` wraps it to constrain
// the key and value types to a shader's uniform type.

import { useContext } from 'react';
import { fieldTestId } from '../../test-id';
import { ControlFormContext, type FieldValue } from './control-form';

export type Field = {
  readonly value: FieldValue | undefined;
  readonly onChange: (value: FieldValue) => void;
  readonly disabled: boolean;
  /** Deterministic `accessibilityIdentifier` for this field: `<form path>.<key>`. */
  readonly testID: string;
};

export function useField(key: string): Field {
  const ctx = useContext(ControlFormContext);
  if (ctx === null) {
    throw new Error(
      `useField("${key}") must be rendered inside a <ControlForm>. A shader control ` +
        'fragment is mounted by its composite form, not standalone.',
    );
  }
  return {
    value: ctx.values[key],
    onChange: (value) => ctx.setField(key, value),
    disabled: ctx.disabled,
    testID: fieldTestId(ctx.path, key),
  };
}
