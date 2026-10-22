import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { ConfirmService } from '../../core/confirm';
import { HouseholdsService } from '../../core/households';
import { NavService } from '../../core/nav';
import { I18n, LANGS, Lang, TPipe } from '../../core/i18n';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';
import { User } from '../../core/models';
import { NavIcon } from '../../shared/nav-icon';
import { ThemePicker } from '../../shared/theme-picker';

@Component({
  selector: 'app-account',
  imports: [FormsModule, RouterLink, NavIcon, ThemePicker, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>{{ 'account.title' | t }}</h1>
    <section class="card narrow">
      <h2>{{ 'account.display' | t }}</h2>
      <form (ngSubmit)="saveName()">
        <label
          >{{ 'account.name' | t }} <input name="d" [(ngModel)]="display" maxlength="60"
        /></label>
        <button type="submit">{{ 'common.save' | t }}</button>
      </form>
      <p class="muted small">
        {{ 'account.username_is' | t }} <strong>{{ session.user()?.username }}</strong>
      </p>
    </section>
    @if (pages().length) {
      <section class="card narrow">
        <h2>{{ 'account.pages' | t }}</h2>
        <ul class="page-links">
          @for (n of pages(); track n.path) {
            <li><a [routerLink]="n.path"><app-nav-icon [name]="n.path" /> {{ n.label | t }}</a></li>
          }
        </ul>
      </section>
    }
    <section class="card narrow">
      <h2>{{ 'app.language' | t }}</h2>
      <label
        >{{ 'account.language_hint' | t }}
        <select name="lang" [ngModel]="i18n.lang" (ngModelChange)="setLang($event)">
          @for (l of langs; track l.code) {
            <option [value]="l.code">{{ l.name }}</option>
          }
        </select>
      </label>
    </section>
    <section class="card narrow">
      <h2>{{ 'theme.title' | t }}</h2>
      <app-theme-picker />
    </section>
    <section class="card narrow">
      <h2>{{ 'account.change_password' | t }}</h2>
      <form (ngSubmit)="changePassword()">
        <label
          >{{ 'account.current_password' | t }}
          <input
            name="o"
            type="password"
            [(ngModel)]="old"
            autocomplete="current-password"
            required
        /></label>
        <label
          >{{ 'account.password_min' | t }}
          <input
            name="n"
            type="password"
            [(ngModel)]="pw"
            autocomplete="new-password"
            required
            minlength="8"
          />
        </label>
        <button type="submit" [disabled]="busy()">{{ 'account.change_password' | t }}</button>
      </form>
    </section>
    <section class="card narrow">
      <h2>{{ 'app.logout' | t }}</h2>
      <p class="muted">{{ 'account.logout_hint' | t }}</p>
      <button type="button" class="danger" (click)="logout()">{{ 'app.logout' | t }}</button>
    </section>
  `,
})
export class Account {
  protected session = inject(SessionService);
  protected i18n = inject(I18n);
  protected langs = LANGS;
  private api = inject(Api);
  private notify = inject(Notify);
  protected display = this.session.user()?.display ?? '';
  protected old = '';
  protected pw = '';
  protected busy = signal(false);
  private nav = inject(NavService);
  private confirm = inject(ConfirmService);
  private households = inject(HouseholdsService);
  private router = inject(Router);

  /** Pages that are not in the bottom bar: Families, Admin (only for admins, see NavService). */
  protected pages = computed(() => this.nav.items().filter((n) => n.path === '/famiglie' || n.path === '/admin'));

  /** Asks first: logging out by a stray tap would be annoying in the middle of cooking. */
  async logout(): Promise<void> {
    if (!(await this.confirm.ask(this.i18n.t('account.logout_confirm'), 'app.logout'))) return;
    await this.session.logout();
    this.households.reset();
    this.router.navigateByUrl('/login');
  }

  async saveName(): Promise<void> {
    try {
      const u = await this.api.put<User>('me', { display: this.display });
      this.session.state.update((s) => (s ? { ...s, user: u } : s));
      this.notify.ok('account.name_saved');
    } catch (e) {
      this.notify.error(e);
    }
  }

  async setLang(lang: Lang): Promise<void> {
    try {
      await this.api.put<User>('me', { lang });
      this.i18n.use(lang);
    } catch (e) {
      this.notify.error(e);
    }
  }

  async changePassword(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.post('me/password', { old: this.old, new: this.pw });
      this.old = this.pw = '';
      this.notify.ok('account.password_changed');
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
