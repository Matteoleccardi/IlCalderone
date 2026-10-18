import { describe, expect, it } from 'vitest';
import { de } from '../../i18n/de';
import { en } from '../../i18n/en';
import { fr } from '../../i18n/fr';
import { it as itDict } from '../../i18n/it';
import { AppError, I18n } from './i18n';

describe('translations', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

  it('use the same {placeholders} and plural forms in every language', () => {
    for (const [lang, dict] of Object.entries({ en, de, fr })) {
      for (const [key, text] of Object.entries(itDict)) {
        const other = (dict as Record<string, string>)[key];
        expect(placeholders(other), `${lang} ${key}`).toBe(placeholders(text));
        expect(other.split('|').length, `${lang} ${key}`).toBe(text.split('|').length);
      }
    }
  });
});

describe('I18n.t', () => {
  async function make(lang: 'it' | 'en' | 'fr') {
    const i = new I18n();
    await i.load(lang);
    return i;
  }

  it('fills placeholders and picks plural forms', async () => {
    const i = await make('it');
    expect(i.t('recipes.count', { n: 1 })).toBe('1 ricetta');
    expect(i.t('recipes.count', { n: 3 })).toBe('3 ricette');
    expect(i.t('home.hello', { name: 'Ada' })).toBe('Ciao Ada!');
    // a "|" is only a plural separator when {n} is given
    expect(i.t('form.text_format')).toContain('|');
    expect((await make('fr')).t('recipes.count', { n: 0 })).toBe('0 recette');
    expect((await make('en')).t('recipes.count', { n: 0 })).toBe('0 recipes');
  });

  it('translates nested errors and API codes, with the server text as fallback', async () => {
    const i = await make('en');
    expect(i.t('fmt.line_error', { line: 2, error: new AppError('err.qty_invalid', { value: 'x' }) })).toBe(
      'line 2: Invalid quantity "x" (use a number, 1/2 or q.b.)',
    );
    expect(i.error('import_failed', { title: 'Soup', reason: 'recipe_title_required' })).toBe('"Soup": The recipe needs a title');
    expect(i.error('brand_new_code', {}, 'Server text')).toBe('Server text');
  });
});
