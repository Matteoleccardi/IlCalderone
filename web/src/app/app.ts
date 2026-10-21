import { Component, ElementRef, computed, effect, inject, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
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

/** The bottom tabs, by page path (docs/design.md): everything else lives in the "More" sheet, in this order. */
const TABS = ['/ricette', '/menu', '/spesa'];
const MORE_ORDER = ['/raccolte', '/diario', '/famiglie', '/admin'];

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

  /** The labelled tabs next to "More". */
  protected tabs = computed(() => TABS.flatMap((p) => this.nav().filter((n) => n.path === p)));

  /** What "More" holds: the other pages of the enabled features. */
  protected moreItems = computed(() => {
    const rank = (p: string) => (MORE_ORDER.includes(p) ? MORE_ORDER.indexOf(p) : MORE_ORDER.length);
    return this.nav()
      .filter((n) => !TABS.includes(n.path))
      .sort((a, b) => rank(a.path) - rank(b.path));
  });

  private url = signal(this.router.url);
  /** "More" is the current tab when the page is one of its pages (or the account). */
  protected moreActive = computed(() => {
    const u = this.url();
    return u.startsWith('/account') || this.moreItems().some((n) => u.startsWith(n.path));
  });

  private bottomNav = viewChild<ElementRef<HTMLElement>>('bottomNav');
  private more = viewChild<ElementRef<HTMLDialogElement>>('more');

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => this.url.set(e.urlAfterRedirects));
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

  protected openMore(): void {
    this.more()?.nativeElement.showModal();
  }

  protected closeMore(): void {
    this.more()?.nativeElement.close();
  }

  protected async logout(): Promise<void> {
    this.closeMore();
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
