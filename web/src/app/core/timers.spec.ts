import { describe, expect, it } from 'vitest';
import { chunkBySize, jsonSize } from '../shared/json-batch';
import { parentsFirst } from '../features/recipes/recipe-import';
import { formatLeft, parseDuration } from './timers';

describe('timer durations', () => {
  it('parses minutes, mm:ss and decimals', () => {
    expect(parseDuration('10')).toBe(600_000);
    expect(parseDuration(' 1:30 ')).toBe(90_000);
    expect(parseDuration('1,5')).toBe(90_000);
    expect(parseDuration('0.5')).toBe(30_000);
  });
  it('rejects what is not a time', () => {
    for (const s of ['', 'abc', '0', '1:75', '-3', '2000']) expect(parseDuration(s)).toBeNull();
  });
  it('formats the time left, rounding up', () => {
    expect(formatLeft(754_000)).toBe('12:34');
    expect(formatLeft(3_723_000)).toBe('1:02:03');
    expect(formatLeft(400)).toBe('0:01');
    expect(formatLeft(-5000)).toBe('0:00');
  });
});

describe('batch import', () => {
  it('splits by size, keeps the order and sets apart items too large alone', () => {
    const small = (i: number) => ({ i, pad: 'x'.repeat(80) });
    const huge = { i: 99, pad: 'x'.repeat(5000) };
    const items = [small(1), small(2), huge, small(3), small(4), small(5)];
    const max = jsonSize(small(1)) * 2 + 10;
    const { chunks, tooBig } = chunkBySize(items, max);
    expect(tooBig).toEqual([huge]);
    expect(chunks.map((c) => c.map((x) => x['i']))).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkBySize(items.filter((x) => x !== huge), 1e9, 2).chunks.length).toBe(3);
  });
  it('puts parents before their variants', () => {
    const items = [
      { id: 'c', parents: [{ id: 'b' }] },
      { id: 'b', parents: [{ id: 'a' }] },
      { id: 'x', parents: [{ id: 'not-in-batch' }] },
      { id: 'a', parents: [] },
    ];
    expect(parentsFirst(items).map((i) => i['id'])).toEqual(['a', 'b', 'c', 'x']);
  });
});
