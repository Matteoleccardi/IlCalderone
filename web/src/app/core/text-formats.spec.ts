import { describe, expect, it } from 'vitest';
import { AppError } from './i18n';
import { fmtQty, ingredientsToText, parseIngredients, parseQty, parseSteps, scaleQty, stepsToText } from './text-formats';

describe('quantities', () => {
  it('parses numbers, decimal commas, fractions and q.b.', () => {
    expect(parseQty('180')).toBe(180);
    expect(parseQty('0,5')).toBe(0.5);
    expect(parseQty('1/2')).toBe(0.5);
    expect(parseQty('1 1/2')).toBe(1.5);
    expect(parseQty('q.b.')).toBeNull();
    expect(parseQty('')).toBeNull();
    expect(() => parseQty('tanto')).toThrow(AppError);
    try {
      parseQty('tanto');
    } catch (e) {
      expect(e).toMatchObject({ key: 'err.qty_invalid', params: { value: 'tanto' } });
    }
  });

  it('formats with at most two decimals and a comma (a dot in English)', () => {
    expect(fmtQty(2)).toBe('2');
    expect(fmtQty(1 / 3)).toBe('0,33');
    expect(fmtQty(0.25)).toBe('0,25');
    expect(fmtQty(0.25, 'en')).toBe('0.25');
    expect(fmtQty(null)).toBe('q.b.');
  });

  it('scales for servings', () => {
    expect(scaleQty(200, 4, 2)).toBe(100);
    expect(scaleQty(null, 4, 2)).toBeNull();
  });
});

describe('ingredient text', () => {
  it('round-trips', () => {
    const text = 'Pasta | 320 | g\nSale | q.b. | q.b.\nPepe | 1 | p. | facoltativo\nLimone | 1/2 | p. | solo la scorza';
    const list = parseIngredients(text);
    expect(list).toEqual([
      { name: 'Pasta', qty: 320, unit: 'g', optional: false, note: '' },
      { name: 'Sale', qty: null, unit: 'q.b.', optional: false, note: '' },
      { name: 'Pepe', qty: 1, unit: 'p.', optional: true, note: '' },
      { name: 'Limone', qty: 0.5, unit: 'p.', optional: false, note: 'solo la scorza' },
    ]);
    expect(parseIngredients(ingredientsToText(list))).toEqual(list);
    // the "optional" word of any interface language is understood
    expect(parseIngredients('Pepe | 1 | p. | optionnel')[0].optional).toBe(true);
    expect(ingredientsToText([list[2]], 'optional', 'en')).toBe('Pepe | 1 | p. | optional');
  });

  it('defaults to q.b. and reports the bad line', () => {
    expect(parseIngredients('Sale')[0]).toMatchObject({ qty: null, unit: 'q.b.' });
    expect(() => parseIngredients('Pasta | 1\n | 2')).toThrow(expect.objectContaining({ key: 'fmt.no_name', params: { line: 2 } }));
  });
});

describe('steps text', () => {
  it('uses the first line as title and strips "1/3" numbering', () => {
    const steps = parseSteps('1/2 Cuocete\nIn acqua salata.\nPer 10 minuti.\n\nServite subito.');
    expect(steps).toEqual([
      { title: 'Cuocete', text: 'In acqua salata. Per 10 minuti.' },
      { title: '', text: 'Servite subito.' },
    ]);
    expect(parseSteps(stepsToText(steps))).toEqual(steps);
  });
});
