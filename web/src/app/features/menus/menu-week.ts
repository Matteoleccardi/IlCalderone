const DAY = 86_400_000;

function utc(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Which week (1-based) of a menu of `weeks` weeks that starts on `start` (YYYY-MM-DD) a date falls in; the cycle repeats and wraps backwards too. */
export function menuWeek(start: string, weeks: number, date: string): number {
  const w = Math.floor((utc(date) - utc(start)) / (7 * DAY));
  return ((w % weeks) + weeks) % weeks + 1;
}
