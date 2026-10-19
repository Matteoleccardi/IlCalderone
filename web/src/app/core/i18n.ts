import { Injectable, Pipe, PipeTransform, inject } from '@angular/core';
import type { Dict, Key } from '../../i18n/it';

/**
 * Interface translations. Only the app's own texts are translated: recipes, ingredients and other things users
 * write stay as they are (the browser can translate those).
 *
 * - Dictionaries live in src/i18n/<lang>.ts. it.ts is the reference: the other files are typed against it, so the
 *   build fails if a key is missing or misspelt.
 * - Texts may contain {name} placeholders, and "one|other" plural forms chosen by the {n} parameter
 *   (a "|" is only read as a plural separator when an {n} parameter is passed).
 * - The language is applied at start-up; changing it reloads the page (so every text is simply rendered once).
 */
export type Lang = 'it' | 'en' | 'de' | 'fr';

export const LANGS: { code: Lang; name: string }[] = [
  { code: 'it', name: 'Italiano' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
];

export type Params = Record<string, unknown>;

const STORAGE_KEY = 'calderone.lang';

const LOADERS: Record<Lang, () => Promise<Dict>> = {
  it: () => import('../../i18n/it').then((m) => m.it),
  en: () => import('../../i18n/en').then((m) => m.en),
  de: () => import('../../i18n/de').then((m) => m.de),
  fr: () => import('../../i18n/fr').then((m) => m.fr),
};

/** An error whose message is a translation key (thrown by client-side checks such as the ingredient parser). */
export class AppError extends Error {
  constructor(public key: Key, public params: Params = {}) {
    super(key);
  }
}

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && LANGS.some((l) => l.code === v);
}

@Injectable({ providedIn: 'root' })
export class I18n {
  lang: Lang = 'it';
  private dict: Partial<Dict> = {};
  private plurals = new Intl.PluralRules('it');

  /** The language saved in this browser, else the first supported browser language, else Italian. */
  preferred(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLang(saved)) return saved;
    } catch {
      /* storage blocked */
    }
    for (const l of navigator.languages ?? [navigator.language]) {
      const code = l?.slice(0, 2).toLowerCase();
      if (isLang(code)) return code;
    }
    return 'it';
  }

  async load(lang: Lang): Promise<void> {
    this.lang = lang;
    this.dict = await LOADERS[lang]();
    this.plurals = new Intl.PluralRules(lang);
    document.documentElement.lang = lang;
  }

  /** Switch language: remember it in this browser and reload the page. */
  use(lang: Lang): void {
    this.remember(lang);
    location.reload();
  }

  remember(lang: Lang): void {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage blocked: the account preference still applies after login */
    }
  }

  t(key: Key | string, params: Params = {}): string {
    let text = (this.dict as Record<string, string>)[key] ?? key;
    if ('n' in params && text.includes('|')) {
      const forms = text.split('|');
      const n = Number(params['n'] ?? 0);
      text = this.plurals.select(n) === 'one' || forms.length === 1 ? forms[0] : forms[1];
    }
    return text.replace(/\{(\w+)\}/g, (_, name: string) => {
      const v = params[name];
      if (v instanceof AppError) return this.t(v.key, v.params);
      if (typeof v === 'number') return this.number(v);
      return v === undefined || v === null ? '' : String(v);
    });
  }

  has(key: string): boolean {
    return key in this.dict;
  }

  /** Message for an API error code (see public/api/lib/Messages.php), with the server's English text as fallback. */
  error(code: string, params: Params = {}, fallback = ''): string {
    const p: Params = { ...params };
    if (typeof p['reason'] === 'string' && this.has('err.' + p['reason'])) p['reason'] = this.t('err.' + p['reason'], params);
    return this.has('err.' + code) ? this.t('err.' + code, p) : fallback || code;
  }

  /** Alphabetical order in the interface language, ignoring case and accents ("arancia" < "Banana" < "ciliegia"). */
  compare = (a: string, b: string): number => {
    this.collator ??= new Intl.Collator(this.lang, { sensitivity: 'base', numeric: true });
    return this.collator.compare(a, b);
  };
  private collator?: Intl.Collator;

  number(n: number, digits = 2): string {
    return new Intl.NumberFormat(this.lang, { maximumFractionDigits: digits, useGrouping: false }).format(n);
  }

  /** "2026-10-18" → e.g. "domenica 18 ottobre 2026" (options as for toLocaleDateString). */
  date(day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
    const [y, m, d] = day.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(this.lang, opts);
  }

  /** An ISO timestamp in local time, e.g. "18/10/2026, 14:02". */
  dateTime(iso: string): string {
    return new Date(iso).toLocaleString(this.lang, { dateStyle: 'medium', timeStyle: 'short' });
  }

  /** Weekday names Monday..Sunday. */
  weekdays(style: 'long' | 'short' = 'long'): string[] {
    // 2024-01-01 was a Monday
    return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(this.lang, { weekday: style }));
  }

  months(): string[] {
    return Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(this.lang, { month: 'long' }));
  }
}

/** {{ 'key' | t }} or {{ 'key' | t: { n: 3 } }}. Pure: the language never changes without a reload. */
@Pipe({ name: 't' })
export class TPipe implements PipeTransform {
  private i18n = inject(I18n);

  transform(key: Key | string, params?: Params): string {
    return this.i18n.t(key, params);
  }
}
