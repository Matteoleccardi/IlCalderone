import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DEFAULT_DARK, DEFAULT_LIGHT, THEMES, ThemeInfo } from '../../themes/themes';
import { Api } from './api';
import { SessionService } from './session';

/** auto = follow the phone's light/dark setting. */
export type ThemeMode = 'auto' | 'light' | 'dark';

export interface ThemePref {
  light: string;
  dark: string;
  mode: ThemeMode;
}

/** Same key and rule as the inline script in index.html, which sets the theme before the app starts. */
export const THEME_KEY = 'calderone.theme';

const byId = new Map(THEMES.map((t) => [t.id, t]));

/** A clean preference: unknown or wrong-kind ids become the defaults. */
export function cleanPref(p: Partial<ThemePref> | null | undefined): ThemePref {
  const ok = (id: unknown, kind: ThemeInfo['kind']) =>
    typeof id === 'string' && byId.get(id)?.kind === kind ? id : null;
  return {
    light: ok(p?.light, 'light') ?? DEFAULT_LIGHT,
    dark: ok(p?.dark, 'dark') ?? DEFAULT_DARK,
    mode: p?.mode === 'light' || p?.mode === 'dark' ? p.mode : 'auto',
  };
}

/** The theme to show now. */
export function resolveTheme(p: ThemePref, systemDark: boolean): string {
  const dark = p.mode === 'dark' || (p.mode === 'auto' && systemDark);
  return dark ? p.dark : p.light;
}

/**
 * The colour theme: a favourite light and dark theme, and whether to follow the phone (auto) or force one.
 * Kept in this browser (localStorage) and in the account, so it follows the user to other devices.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private api = inject(Api);
  private session = inject(SessionService);

  readonly pref = signal<ThemePref>(cleanPref(readLocal()));
  private systemDark = signal(false);
  readonly active = computed(() => resolveTheme(this.pref(), this.systemDark()));
  readonly activeKind = computed(() => byId.get(this.active())?.kind ?? 'light');

  constructor() {
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq) {
      this.systemDark.set(mq.matches);
      mq.addEventListener?.('change', (e) => this.systemDark.set(e.matches));
    }
    effect(() => apply(this.active()));
    // a saved account theme wins (log in on a new phone → your theme)
    effect(() => {
      const t = this.session.user()?.theme;
      if (t) this.setLocal(cleanPref(t));
    });
  }

  /** Change the preference (from the Appearance settings): saved here and, when logged in, in the account. */
  async set(change: Partial<ThemePref>): Promise<void> {
    const next = cleanPref({ ...this.pref(), ...change });
    this.setLocal(next);
    if (this.session.user()) {
      try {
        const user = await this.api.put<NonNullable<ReturnType<SessionService['user']>>>('me', { theme: next });
        this.session.state.update((s) => (s ? { ...s, user } : s));
      } catch {
        /* still applied in this browser */
      }
    }
  }

  private setLocal(p: ThemePref): void {
    const cur = this.pref();
    if (cur.light !== p.light || cur.dark !== p.dark || cur.mode !== p.mode) this.pref.set(p);
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(p));
    } catch {
      /* private mode: only for this visit */
    }
  }
}

function readLocal(): Partial<ThemePref> | null {
  try {
    return JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function apply(id: string): void {
  const root = document.documentElement;
  root.dataset['theme'] = id;
  // the phone's browser bar takes the page colour
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  if (bg) meta.content = bg;
}
