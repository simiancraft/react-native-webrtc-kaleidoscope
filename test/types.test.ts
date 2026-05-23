import { describe, expect, test } from 'bun:test';
import { toEffectSpec } from '../src/types';

describe('toEffectSpec', () => {
  test('wraps a bare effect name into a spec object', () => {
    expect(toEffectSpec('blur')).toEqual({ name: 'blur' });
    expect(toEffectSpec('mirror')).toEqual({ name: 'mirror' });
  });

  test('passes a spec object through by reference', () => {
    const spec = { name: 'background-image', source: 'office-1' } as const;
    expect(toEffectSpec(spec)).toBe(spec);
  });
});
