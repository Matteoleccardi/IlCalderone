import { Component, ElementRef, computed, effect, inject, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api } from './core/api';
import { FEATURES } from './core/features';
import { HouseholdsService } from './core/households';
import { I18n, LANGS, Lang, TPipe } from './core/i18n';
import { Notify } from './core/notify';
import { SessionService } from './core/session';
import { Brand } from './shared/brand';
import { NavIcon } from './shared/nav-icon';
import { TimerDock } from './shared/timer-dock';
import { ThemeService } from './core/theme';

/** Order of the bottom navigation icons, by page path (other pages come after). */
const NAV_ORDER = ['/ricette', '/menu', '/raccolte', '/spesa', '/diario', '/famiglie', '/admin'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand, NavIcon, TimerDock, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.html',
})
export class App {
  protected session = inject(SessionService);
  protected notify = inject(Notify);
  protected i18n = inject(I18n);
  protected langs = LANGS;
  private features = inject(FEATURES);
  private router = inject(Router);
  private households = inject(HouseholdsService);
  private api = inject(Api);
  // started here so the theme follows the phone's light/dark setting on every page
  private theme = inject(ThemeService);

  /** Navigation of the enabled features (+ admin entries for admins). */
  protected nav = computed(() => {
    const user = this.session.user();
    const mods = this.session.modules();
    return this.features
      .filter((f) => !f.module || mods.has(f.module))
      .flatMap((f) => f.nav ?? [])
      .filter((n) => !n.admin || user?.admin);
  });

  /** The bottom navigation: one row of icons in a fixed order. */
  protected navItems = computed(() => {
    const rank = (p: string) => (NAV_ORDER.includes(p) ? NAV_ORDER.indexOf(p) : NAV_ORDER.length);
    return [...this.nav()].sort((a, b) => rank(a.path) - rank(b.path));
  });

  private bottomNav = viewChild<ElementRef<HTMLElement>>('bottomNav');

  constructor() {
    // keep room at the bottom of every page for the navigation (its height depends on the rows and the font)
    let ro: ResizeObserver | undefined;
    effect(() => {
      const el = this.bottomNav()?.nativeElement;
      ro?.disconnect();
      const set = (h: number) => document.documentElement.style.setProperty('--nav-h', `${Math.ceil(h)}px`);
      if (!el) {
        set(0);
        return;
      }
      ro = new ResizeObserver(() => set(el.getBoundingClientRect().height));
      ro.observe(el);
    });
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
    this.households.reset();
    this.router.navigateByUrl('/login');
  }

  /** Change the interface language (saved in the account too when logged in), then reload. */
  protected async setLang(lang: Lang): Promise<void> {
    if (this.session.user()) {
      try {
        await this.api.put('me', { lang });
      } catch {
        /* the browser setting still applies */
      }
    }
    this.i18n.use(lang);
  }
}
