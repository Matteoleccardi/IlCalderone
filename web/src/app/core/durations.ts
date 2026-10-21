/**
 * Durations written in a recipe step ("10 Minuten", "20-25 min", "1 h", "2 ore", "15 minutes", "1 heure"), in ms,
 * in the order they appear. A range gives its upper end. Used to offer a timer button inside a step (cooking mode).
 */
const UNIT = '(h|hrs?|hours?|std\\.?|stunden?|stunde|ore|ora|heures?|min\\.?|minuten|minute|minuti|minuto|minutes|mins?)';
const RE = new RegExp(`(\\d+(?:[.,]\\d+)?)(?:\\s*[-–]\\s*(\\d+(?:[.,]\\d+)?))?\\s*${UNIT}(?![\\p{L}])`, 'giu');

export function parseDurations(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(RE)) {
    const n = parseFloat((m[2] ?? m[1]).replace(',', '.'));
    const unit = m[3].toLowerCase();
    const hours = /^(h|hrs?|hours?|std\.?|stunden?|stunde|ore|ora|heures?)$/.test(unit);
    const ms = Math.round(n * (hours ? 3_600_000 : 60_000));
    if (ms > 0 && ms <= 24 * 3_600_000) out.push(ms);
  }
  return out;
}
