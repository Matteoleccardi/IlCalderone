import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';

/** First run only: create the administrator account. */
@Component({
  selector: 'app-setup',
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="narrow card">
      <h1>{{ 'setup.title' | t }}</h1>
      <p>{{ 'setup.intro' | t }}</p>
      <form (ngSubmit)="submit()">
        <label
          >{{ 'login.username' | t }}
          <input name="u" [(ngModel)]="username" required minlength="3" autocomplete="username"
        /></label>
        <label
          >{{ 'account.display' | t }}
          <input name="d" [(ngModel)]="display" [placeholder]="'common.optional' | t"
        /></label>
        <label
          >{{ 'account.password_min' | t }}
          <input
            name="p"
            type="password"
            [(ngModel)]="password"
            required
            minlength="8"
            autocomplete="new-password"
          />
        </label>
        <label
          >{{ 'setup.repeat' | t }}
          <input
            name="p2"
            type="password"
            [(ngModel)]="password2"
            required
            autocomplete="new-password"
        /></label>
        <button type="submit" class="primary" [disabled]="busy()">{{ 'setup.submit' | t }}</button>
      </form>
    </section>
  `,
})
export class Setup implements OnInit {
  protected username = '';
  protected display = '';
  protected password = '';
  protected password2 = '';
  protected busy = signal(false);
  private session = inject(SessionService);
  private router = inject(Router);
  private notify = inject(Notify);
  private i18n = inject(I18n);
  private api = inject(Api);

  async ngOnInit(): Promise<void> {
    if (!(await this.session.ensure()).needs_setup) this.router.navigateByUrl('/');
  }

  async submit(): Promise<void> {
    if (this.password !== this.password2) {
      this.notify.error('setup.mismatch');
      return;
    }
    this.busy.set(true);
    try {
      await this.session.setup(this.username, this.password, this.display);
      this.api.put('me', { lang: this.i18n.lang }).catch(() => {});
      this.notify.ok('setup.done');
      this.router.navigateByUrl('/');
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
