import { describe, expect, it } from 'vitest';
import { chunkBySize, jsonSize } from '../shared/json-batch';
import { parentsFirst } from '../features/recipes/recipe-import';
import { formatLeft } from './timers';
import { joinDuration, splitDuration } from '../shared/duration-wheel';
import { cleanPref, resolveTheme } from './theme';
import { pickLogo, weekIndex } from './logo';
import { suggestDiet } from './facets';

describe('timer durations', () => {
  it('converts the wheels to and from milliseconds', () => {
    expect(joinDuration(1, 2, 30)).toBe(3_750_000);
    expect(splitDuration(3_750_000)).toEqual([1, 2, 30]);
    expect(splitDuration(150_000)).toEqual([0, 2, 30]);
    expect(splitDuration(30 * 3600 * 1000)[0]).toBe(23);
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

describe('themes', () => {
  it('follows the phone in auto mode and ignores it when forced', () => {
    const p = cleanPref({ light: 'catppuccin-latte', dark: 'catppuccin-mocha', mode: 'auto' });
    expect(resolveTheme(p, false)).toBe('catppuccin-latte');
    expect(resolveTheme(p, true)).toBe('catppuccin-mocha');
    expect(resolveTheme({ ...p, mode: 'light' }, true)).toBe('catppuccin-latte');
    expect(resolveTheme({ ...p, mode: 'dark' }, false)).toBe('catppuccin-mocha');
  });
  it('falls back to the Calderone themes for unknown or wrong-kind ids', () => {
    expect(cleanPref({ light: 'nope', dark: 'catppuccin-latte', mode: 'x' as never })).toEqual({
      light: 'dispensa-light',
      dark: 'dispensa-dark',
      mode: 'auto',
    });
    expect(cleanPref(null).mode).toBe('auto');
  });
});

describe('weekly logo', () => {
  it('counts weeks from Monday to Sunday', () => {
    expect(weekIndex(new Date(1970, 0, 5))).toBe(0);
    expect(weekIndex(new Date(1970, 0, 11))).toBe(0);
    expect(weekIndex(new Date(1970, 0, 12))).toBe(1);
    expect(weekIndex(new Date(2026, 9, 19))).toBe(weekIndex(new Date(2026, 9, 25))); // Mon–Sun same week
  });
  it('shows every image once per cycle, never the same two weeks in a row', () => {
    const list = Array.from({ length: 35 }, (_, i) => i);
    let prev = -1;
    for (let c = 0; c < 20; c++) {
      const seen = new Set<number>();
      for (let w = c * 35; w < (c + 1) * 35; w++) {
        const x = pickLogo(list, w)!;
        expect(x).not.toBe(prev);
        seen.add(x);
        prev = x;
      }
      expect(seen.size).toBe(35);
    }
    expect(pickLogo([], 3)).toBeNull();
    expect(pickLogo(['only'], 99)).toBe('only');
  });
});

describe('diet from the ingredients', () => {
  it('finds meat, fish, animal products or none', () => {
    expect(suggestDiet(['Pasta', 'Guanciale', 'Pecorino'])).toBe('carne');
    expect(suggestDiet(['Spaghetti', 'Vongole veraci'])).toBe('pesce');
    expect(suggestDiet(['Farina', 'Uova', 'Burro'])).toBe('vegetariana');
    expect(suggestDiet(['Ceci cotti', 'Latte di cocco', 'Burro di arachidi', 'Tempeh'])).toBe('vegana');
    expect(suggestDiet(['Melagrana', 'Granella di nocciole', 'Lattuga'])).toBe('vegana'); // not grana / latte
    expect(suggestDiet([])).toBeNull();
  });
});
