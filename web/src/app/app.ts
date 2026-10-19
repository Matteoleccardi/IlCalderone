import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api } from './core/api';
import { FEATURES } from './core/features';
import { HouseholdsService } from './core/households';
import { I18n, LANGS, Lang, TPipe } from './core/i18n';
import { Notify } from './core/notify';
import { SessionService } from './core/session';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe],
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

  /** Navigation of the enabled features (+ admin entries for admins). */
  protected nav = computed(() => {
    const user = this.session.user();
    const mods = this.session.modules();
    return this.features
      .filter((f) => !f.module || mods.has(f.module))
      .flatMap((f) => f.nav ?? [])
      .filter((n) => !n.admin || user?.admin);
  });

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
