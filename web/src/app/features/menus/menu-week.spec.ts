import { describe, expect, it } from 'vitest';
import { menuWeek } from './menu-week';

describe('menuWeek', () => {
  it('counts weeks from the start and wraps after the last one', () => {
    expect(menuWeek('2026-10-12', 4, '2026-10-12')).toBe(1);
    expect(menuWeek('2026-10-12', 4, '2026-10-18')).toBe(1);
    expect(menuWeek('2026-10-12', 4, '2026-10-19')).toBe(2);
    expect(menuWeek('2026-10-12', 4, '2026-11-09')).toBe(1);
  });
  it('wraps backwards before the start', () => {
    expect(menuWeek('2026-10-12', 4, '2026-10-11')).toBe(4);
    expect(menuWeek('2026-10-12', 2, '2026-10-05')).toBe(2);
  });
});
