// Quantities and the plain-text formats of the recipe editor (ported from the v0.1 Python service).
import { AppError } from './i18n';
import { Ingredient, Step } from './models';

/** "quanto basta" (to taste): the unit stored for ingredients without a quantity. */
export const QB = 'q.b.';

/** Words accepted in the 4th field of the text format to mark an optional ingredient (any interface language). */
const OPTIONAL_WORDS = /^(facoltativ|opzional|optional|optionnel|fakultativ)/i;

/** "180", "0,5", "1/2", "1 1/2", "q.b." → number (null = q.b.). Throws an AppError on anything else. */
export function parseQty(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return input;
  const s = input.trim().toLowerCase().replace(',', '.');
  if (s === '' || s === QB || s === 'qb' || s === 'q.b') return null;
  let total = 0;
  for (const part of s.split(/\s+/)) {
    const frac = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(part);
    if (frac && Number(frac[2]) !== 0) total += Number(frac[1]) / Number(frac[2]);
    else if (/^\d+(?:\.\d+)?$/.test(part)) total += Number(part);
    else throw new AppError('err.qty_invalid', { value: input });
  }
  return total;
}

/**
 * 2 decimals max: 0.333 → "0,33" (decimal comma, except in English), 2 → "2", null → "q.b.".
 * The editor's text format accepts both separators, so this is also used to write it.
 */
export function fmtQty(qty: number | null, lang = 'it'): string {
  if (qty === null) return QB;
  const s = String(Math.round(qty * 100) / 100);
  return lang === 'en' ? s : s.replace('.', ',');
}

/** Quantity for `wanted` people from a recipe written for `base` people. */
export function scaleQty(qty: number | null, base: number, wanted: number): number | null {
  return qty === null || !base ? qty : (qty * wanted) / base;
}

/** One ingredient per line:  Name | quantity | unit | optional or note   (fields after the name are optional). */
export function parseIngredients(text: string): Ingredient[] {
  const out: Ingredient[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split('|').map((p) => p.trim());
    const name = parts[0];
    if (!name) throw new AppError('fmt.no_name', { line: i + 1 });
    let qty: number | null;
    try {
      qty = parts.length > 1 ? parseQty(parts[1]) : null;
    } catch (e) {
      throw new AppError('fmt.line_error', { line: i + 1, error: e });
    }
    const unit = parts[2] || (qty === null ? QB : '');
    const extra = parts[3] ?? '';
    const optional = OPTIONAL_WORDS.test(extra);
    out.push({ name, qty, unit, optional, note: optional ? '' : extra });
  });
  return out;
}

/** The inverse of parseIngredients; `optionalWord` is the word written for optional ingredients. */
export function ingredientsToText(list: Ingredient[], optionalWord = 'facoltativo', lang = 'it'): string {
  return list
    .map((i) => {
      const extra = i.optional ? optionalWord : i.note;
      return [i.name, i.qty === null ? QB : fmtQty(i.qty, lang), i.unit, ...(extra ? [extra] : [])].join(' | ');
    })
    .join('\n');
}

/** Steps separated by a blank line; the first line of a block is its title when the block has 2+ lines. */
export function parseSteps(text: string): Step[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      lines.length > 1
        ? { title: lines[0].replace(/^\d+\s*\/\s*\d+\s*/, ''), text: lines.slice(1).join(' ') }
        : { title: '', text: lines[0] },
    );
}

export function stepsToText(steps: Step[]): string {
  return steps.map((s) => (s.title ? `${s.title}\n${s.text}` : s.text)).join('\n\n');
}
