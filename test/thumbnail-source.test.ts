import { describe, expect, test } from 'bun:test';
import { thumbnailSource } from '../src/components/preset-book-menu/thumbnail-source';

describe('thumbnailSource', () => {
  test('passes a URL or preset-name string through', () => {
    expect(thumbnailSource('/assets/blur-low.thumb.webp')).toBe('/assets/blur-low.thumb.webp');
  });

  test('passes a Metro asset module id through', () => {
    expect(thumbnailSource(42)).toBe(42);
  });

  test('unwraps the asset object a web require() yields from Expo SDK 57', () => {
    expect(thumbnailSource({ uri: '/assets/x.webp', width: 320, height: 180 })).toBe(
      '/assets/x.webp',
    );
  });

  test('drops anything without a usable source', () => {
    expect(thumbnailSource(undefined)).toBeUndefined();
    expect(thumbnailSource(null)).toBeUndefined();
    expect(thumbnailSource({ uri: 7 })).toBeUndefined();
  });
});
