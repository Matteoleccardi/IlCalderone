import { Component, ElementRef, computed, effect, inject, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TPipe } from './core/i18n';
import { NavService } from './core/nav';
import { Notify } from './core/notify';
import { SessionService } from './core/session';
import { Brand } from './shared/brand';
import { ConfirmSheet } from './shared/confirm-sheet';
import { NavIcon } from './shared/nav-icon';
import { TimerDock } from './shared/timer-dock';
import { ThemeService } from './core/theme';

/** The bottom tabs, by page path (docs/design.md). Families and Admin are links on the account page. */
const TABS = ['/ricette', '/menu', '/spesa', '/raccolte', '/diario'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand, ConfirmSheet, NavIcon, TimerDock, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.html',
})
export class App {
  protected session = inject(SessionService);
  protected notify = inject(Notify);
  private navigation = inject(NavService);
  // started here so the theme follows the phone's light/dark setting on every page
  private theme = inject(ThemeService);

  /** The labelled tabs. */
  protected tabs = computed(() => TABS.flatMap((p) => this.navigation.items().filter((n) => n.path === p)));

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
}
