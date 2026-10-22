import { describe, expect, it } from 'vitest';
import { nextRating, stepRating } from './ratings';

describe('nextRating', () => {
  it('sets, then half a step less, then clears', () => {
    expect(nextRating(null, 4)).toBe(4);
    expect(nextRating(4, 4)).toBe(3.5);
    expect(nextRating(3.5, 4)).toBeNull();
  });
  it('jumps to another icon directly', () => {
    expect(nextRating(2, 5)).toBe(5);
    expect(nextRating(3.5, 2)).toBe(2);
  });
  it('the first icon goes 1, 0.5, none', () => {
    expect(nextRating(1, 1)).toBe(0.5);
    expect(nextRating(0.5, 1)).toBeNull();
  });
});

describe('stepRating', () => {
  it('moves by half steps within 0.5..5', () => {
    expect(stepRating(null, 1)).toBe(0.5);
    expect(stepRating(4.5, 1)).toBe(5);
    expect(stepRating(5, 1)).toBe(5);
    expect(stepRating(0.5, -1)).toBeNull();
    expect(stepRating(null, -1)).toBeNull();
  });
});
