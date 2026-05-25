import { describe, expect, test } from 'bun:test';
import { toEffectSpec } from '../src/types';

describe('toEffectSpec', () => {
  test('wraps a bare effect name into a spec object', () => {
    expect(toEffectSpec('blur')).toEqual({ name: 'blur' });
    expect(toEffectSpec('flip-x')).toEqual({ name: 'flip-x' });
  });

  test('passes a spec object through by reference', () => {
    const spec = { name: 'background-image', source: 'dark-office' } as const;
    expect(toEffectSpec(spec)).toBe(spec);
  });
});
