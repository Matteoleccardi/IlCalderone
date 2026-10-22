import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Assist, HOLD_MS, inBand } from './timer-assist';

describe('inBand', () => {
  it('is the edge strip of the chosen side', () => {
    expect(inBand(380, 390, 'right')).toBe(true);
    expect(inBand(300, 390, 'right')).toBe(false);
    expect(inBand(10, 390, 'left')).toBe(true);
    expect(inBand(10, 390, 'right')).toBe(false);
  });
});

describe('Assist', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enlarges on the first touch and goes back after 1.5 s', () => {
    const seen: boolean[] = [];
    const a = new Assist((s) => seen.push(s.enlarged));
    a.touch(false);
    expect(a.state).toEqual({ enlarged: true, help: false });
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(a.state.enlarged).toBe(true);
    vi.advanceTimersByTime(1);
    expect(a.state).toEqual({ enlarged: false, help: false });
    expect(seen).toEqual([true, false]);
  });

  it('helps more when the second touch misses again', () => {
    const a = new Assist(() => undefined);
    a.touch(false);
    a.touch(false);
    expect(a.state).toEqual({ enlarged: true, help: true });
  });

  it('a touch on the tab does not escalate, and every touch restarts the hold', () => {
    const a = new Assist(() => undefined);
    a.touch(false);
    vi.advanceTimersByTime(1000);
    a.touch(true);
    expect(a.state.help).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(a.state.enlarged).toBe(true);
    vi.advanceTimersByTime(500);
    expect(a.state.enlarged).toBe(false);
  });
});
