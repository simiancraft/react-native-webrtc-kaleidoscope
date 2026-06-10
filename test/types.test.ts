import { describe, expect, test } from 'bun:test';
import { toEffectSpec } from '../src/kaleidoscope/effect';

describe('toEffectSpec', () => {
  test('wraps a bare transform name into a spec object', () => {
    expect(toEffectSpec('flip-x')).toEqual({ name: 'flip-x' });
    expect(toEffectSpec('rotate-cw')).toEqual({ name: 'rotate-cw' });
  });

  test('passes a composite spec object through by reference', () => {
    const spec = {
      name: 'composite',
      layers: [{ id: 'you', shader: 'direct', target: 'subject' }],
    } as const;
    expect(toEffectSpec(spec)).toBe(spec);
  });
});
