import { describe, expect, it } from 'vitest';
import { mediaUrlForKey } from './media';

describe('mediaUrlForKey', () => {
  it('encodes a trusted item key below the media origin', () => {
    expect(mediaUrlForKey(
      'https://media.example.test',
      'items/seller/item-1/cover image.jpg',
    )).toBe('https://media.example.test/items/seller/item-1/cover%20image.jpg');
  });

  it.each([
    undefined,
    '',
    'users/seller/avatar.jpg',
    '../items/seller/item-1/cover.jpg',
    'items/seller/item-1/cover.jpg?redirect=https://evil.test',
  ])('rejects an unsafe or missing key: %s', (key) => {
    expect(mediaUrlForKey('https://media.example.test', key)).toBeNull();
  });
});
