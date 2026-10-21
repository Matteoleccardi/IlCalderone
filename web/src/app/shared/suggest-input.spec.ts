import { describe, expect, it } from 'vitest';
import { suggest } from './suggest-input';

const ingredients = ['Pomodori pelati', 'Pomodoro secco', 'Passata di pomodoro', 'Pasta', 'Ceci', 'Cipolla'];

describe('suggestions for ingredient and unit fields', () => {
  it('puts names starting with the text before names containing it', () => {
    expect(suggest(ingredients, 'pomodor')).toEqual(['Pomodori pelati', 'Pomodoro secco', 'Passata di pomodoro']);
  });
  it('ignores case and accents', () => {
    expect(suggest(['Pàsta', 'Riso'], 'PASTA')).toEqual(['Pàsta']);
    expect(suggest(['Crème fraîche'], 'creme')).toEqual(['Crème fraîche']);
  });
  it('lists the first entries for an empty field, up to the limit', () => {
    expect(suggest(ingredients, '', 3)).toEqual(['Pomodori pelati', 'Pomodoro secco', 'Passata di pomodoro']);
  });
  it('offers nothing when the only match is what is already typed', () => {
    expect(suggest(ingredients, 'Ceci')).toEqual([]);
    expect(suggest(ingredients, 'zzz')).toEqual([]);
  });
  it('still offers the proper spelling when only case or accents differ', () => {
    expect(suggest(ingredients, 'ceci')).toEqual(['Ceci']);
  });
});
