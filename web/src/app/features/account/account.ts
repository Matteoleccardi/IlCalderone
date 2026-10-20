import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api';
import { I18n, LANGS, Lang, TPipe } from '../../core/i18n';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';
import { User } from '../../core/models';
import { ThemePicker } from '../../shared/theme-picker';

@Component({
  selector: 'app-account',
  imports: [FormsModule, ThemePicker, TPipe],
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
