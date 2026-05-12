import { describe, expect, test } from 'bun:test';
import withKaleidoscope from '../plugin/src/withKaleidoscope';

describe('withKaleidoscope', () => {
  test('is a function', () => {
    expect(typeof withKaleidoscope).toBe('function');
  });

  test('returns a usable config object', () => {
    const config = { name: 'demo', slug: 'demo' };
    const result = withKaleidoscope(config as unknown as Parameters<typeof withKaleidoscope>[0]);
    expect(result).toBeDefined();
    expect(result.name).toBe('demo');
  });
});
