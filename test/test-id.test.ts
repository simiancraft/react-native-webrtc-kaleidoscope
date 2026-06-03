import { describe, expect, test } from 'bun:test';
import {
  categoryTestId,
  controlScope,
  familyTestId,
  fieldTestId,
  flipTestId,
  MASK_TESTID_PREFIX,
  presetTileTestId,
  rotateTestId,
  slug,
  TESTID_ROOT,
  TRANSFORM_TESTID_PREFIX,
} from '../src/test-id';

describe('slug', () => {
  test('lowercases and hyphenates spaces', () => {
    expect(slug('Wizard Tower')).toBe('wizard-tower');
  });
  test('treats underscores as separators', () => {
    expect(slug('light_office')).toBe('light-office');
  });
  test('strips punctuation outside [a-z0-9-]', () => {
    expect(slug('Sci-Fi (Light)!')).toBe('sci-fi-light');
  });
  test('collapses repeats and trims edge hyphens', () => {
    expect(slug('  --Home   Dark--  ')).toBe('home-dark');
  });
  test('keeps already-kebab tokens stable', () => {
    expect(slug('fairy-grotto')).toBe('fairy-grotto');
  });
});

describe('controlScope', () => {
  test('embeds the preset id when scoped by a Tuner', () => {
    expect(controlScope('fairy-grotto', 'sky')).toBe('kld.fairy-grotto.sky');
  });
  test('drops the preset segment when standalone', () => {
    expect(controlScope(null, 'sky')).toBe('kld.sky');
  });
});

describe('fieldTestId', () => {
  test('appends the uniform verbatim to the scope', () => {
    expect(fieldTestId(controlScope('fairy-grotto', 'sky'), 'uSkyLow')).toBe(
      'kld.fairy-grotto.sky.uSkyLow',
    );
  });
});

describe('transform builders', () => {
  test('rotate id carries the degree', () => {
    expect(rotateTestId(TRANSFORM_TESTID_PREFIX, 90)).toBe('kld.transform.rotate-90');
    expect(rotateTestId(TRANSFORM_TESTID_PREFIX, 0)).toBe('kld.transform.rotate-0');
  });
  test('flip id carries the axis', () => {
    expect(flipTestId(TRANSFORM_TESTID_PREFIX, 'x')).toBe('kld.transform.flip-x');
    expect(flipTestId(TRANSFORM_TESTID_PREFIX, 'y')).toBe('kld.transform.flip-y');
  });
  test('honors a custom prefix override', () => {
    expect(rotateTestId('kld.cam2.transform', 180)).toBe('kld.cam2.transform.rotate-180');
  });
});

describe('picker builders', () => {
  test('family tab slugs the display string', () => {
    expect(familyTestId('Worlds')).toBe('kld.family.worlds');
  });
  test('category is qualified by its family', () => {
    expect(categoryTestId('Worlds', 'Wizard Tower')).toBe('kld.category.worlds.wizard-tower');
  });
  test('same category label under two families does not collide', () => {
    expect(categoryTestId('Home', 'Dark')).not.toBe(categoryTestId('Nature', 'Dark'));
  });
  test('preset tile uses the book key verbatim', () => {
    expect(presetTileTestId('fairy-grotto')).toBe('kld.preset.fairy-grotto');
  });
});

describe('constants', () => {
  test('root and default prefixes are stable', () => {
    expect(TESTID_ROOT).toBe('kld');
    expect(TRANSFORM_TESTID_PREFIX).toBe('kld.transform');
    expect(MASK_TESTID_PREFIX).toBe('kld.mask');
  });
});
