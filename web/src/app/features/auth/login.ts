import { Component, ElementRef, OnInit, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe, isLang } from '../../core/i18n';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';

@Component({
  selector: 'app-login',
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="narrow card">
      <h1>{{ 'login.title' | t }}</h1>
      <form (ngSubmit)="submit()">
        <label
          >{{ 'login.username' | t }}
          <input name="u" [(ngModel)]="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required
            [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'login-error' : null"
        /></label>
        <label
          >{{ 'login.password' | t }}
          <input
            name="p"
            type="password"
            [(ngModel)]="password"
            autocomplete="current-password"
            required
            [attr.aria-invalid]="error() ? 'true' : null"
            [attr.aria-describedby]="error() ? 'login-error' : null"
        /></label>
        @if (error(); as msg) {
          <p id="login-error" class="field-error" role="alert"><span aria-hidden="true">⚠</span> {{ msg }}</p>
        }
        <button type="submit" class="primary" [disabled]="busy()">{{ 'login.submit' | t }}</button>
      </form>
      <p class="muted small">{{ 'login.no_account' | t }}</p>
    </section>
  `,
})
export class Login implements OnInit {
  readonly next = input<string>('/');
  protected username = '';
  protected password = '';
  protected busy = signal(false);
  /** The reason the last attempt failed, shown under the fields (not as a toast) and linked to them. */
  protected error = signal('');
  private host = inject(ElementRef<HTMLElement>);
  private session = inject(SessionService);
  private router = inject(Router);
  private notify = inject(Notify);
  private i18n = inject(I18n);
  private api = inject(Api);

  async ngOnInit(): Promise<void> {
    const s = await this.session.ensure();
    if (s.needs_setup) this.router.navigateByUrl('/setup');
    else if (s.user) this.router.navigateByUrl(this.safeNext());
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.session.login(this.username, this.password);
      const lang = this.session.user()?.lang;
      if (isLang(lang) && lang !== this.i18n.lang) {
        // the account has another language: reload in that language
        this.i18n.remember(lang);
        location.assign(document.baseURI.replace(/\/$/, '') + this.safeNext());
        return;
      }
      if (!lang) this.api.put('me', { lang: this.i18n.lang }).catch(() => {});
      this.router.navigateByUrl(this.safeNext());
    } catch (e) {
      this.error.set(this.notify.message(e));
      queueMicrotask(() => this.host.nativeElement.querySelector('input[name=p]')?.focus());
    } finally {
      this.busy.set(false);
    }
  }

  private safeNext(): string {
    const n = this.next() || '/';
    return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/';
  }
}
