import { describe, expect, it } from 'vitest';
import { parseDurations } from './durations';

const MIN = 60_000;

describe('parseDurations', () => {
  it('reads minutes in the four languages', () => {
    expect(parseDurations('Etwa 10 Minuten kochen')).toEqual([10 * MIN]);
    expect(parseDurations('Cuocere per 15 minuti')).toEqual([15 * MIN]);
    expect(parseDurations('Simmer 20 min.')).toEqual([20 * MIN]);
    expect(parseDurations('Cuire 5 minutes')).toEqual([5 * MIN]);
  });
  it('reads hours and decimals', () => {
    expect(parseDurations('1 Stunde ruhen')).toEqual([60 * MIN]);
    expect(parseDurations('2 ore in forno')).toEqual([120 * MIN]);
    expect(parseDurations('1,5 h')).toEqual([90 * MIN]);
    expect(parseDurations('1 heure')).toEqual([60 * MIN]);
  });
  it('takes the upper end of a range and keeps the order', () => {
    expect(parseDurations('20-25 Min. backen, dann 5 Minuten ruhen')).toEqual([25 * MIN, 5 * MIN]);
  });
  it('ignores other numbers and words that start like a unit', () => {
    expect(parseDurations('4 Personen, 200 g Mehl, 3 Mandeln')).toEqual([]);
    expect(parseDurations('2 Minestrone')).toEqual([]);
    expect(parseDurations('')).toEqual([]);
  });
});
