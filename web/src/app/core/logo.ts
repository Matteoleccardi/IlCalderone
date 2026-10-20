/**
 * Which title image to show this week.
 *
 * Weeks are counted continuously (Monday to Sunday, local time) rather than by week-of-year, which restarts at 1
 * every January. The images are dealt in cycles of N weeks (N = number of images): each cycle is a shuffle seeded
 * with the cycle number. So the order looks random, every image is shown once before any repeats, the same
 * image never shows two weeks in a row, and every phone shows the same image during the week.
 */

/** Weeks since Monday 5 January 1970 (week 0), in local time. */
export function weekIndex(d = new Date()): number {
  const monday = Date.UTC(1970, 0, 5);
  const day = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((day - monday) / (7 * 86_400_000));
}

/** Small seeded random generator (mulberry32): the same seed gives the same numbers on every device. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The order of cycle `cycle` for n images (Fisher–Yates with a seeded generator). */
export function cycleOrder(n: number, cycle: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const r = rng(cycle * 2654435761 + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The image of week `week` among `list` (null when the list is empty). */
export function pickLogo<T>(list: readonly T[], week: number): T | null {
  const n = list.length;
  if (!n) return null;
  if (n === 1) return list[0];
  const cycle = Math.floor(week / n);
  const pos = week - cycle * n;
  const order = cycleOrder(n, cycle);
  // no repeat across the boundary: the new cycle doesn't start with the last image of the previous one
  if (order[0] === cycleOrder(n, cycle - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return list[order[pos]];
}
