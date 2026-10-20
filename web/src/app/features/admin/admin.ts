import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { Check, User } from '../../core/models';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';

@Component({
  selector: 'app-admin',
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>{{ 'nav.admin' | t }}</h1>
    <section class="card">
      <h2>{{ 'admin.accounts' | t }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>{{ 'login.username' | t }}</th>
            <th>{{ 'common.name' | t }}</th>
            <th>{{ 'admin.role' | t }}</th>
            <th>{{ 'admin.created' | t }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (u of users(); track u.id) {
            <tr>
              <td>{{ u.username }}</td>
              <td>{{ u.display }}</td>
              <td>{{ (u.admin ? 'admin.role_admin' : 'admin.role_user') | t }}</td>
              <td class="muted small">
                {{ u.created ? i18n.date(u.created, { dateStyle: 'medium' }) : '' }}
              </td>
              <td class="actions">
                <button type="button" class="link" (click)="resetPassword(u)">
                  {{ 'admin.new_password' | t }}
                </button>
                @if (u.id !== session.user()?.id) {
                  <button type="button" class="link danger" (click)="remove(u)">
                    {{ 'common.delete' | t }}
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
      <h3>{{ 'admin.new_account' | t }}</h3>
      <form class="row" (ngSubmit)="create()">
        <label
          >{{ 'login.username' | t }}
          <input name="u" [(ngModel)]="username" required minlength="3" autocomplete="off"
        /></label>
        <label>{{ 'common.name' | t }} <input name="d" [(ngModel)]="display" /></label>
        <label
          >{{ 'admin.initial_password' | t }}
          <input name="p" [(ngModel)]="password" required minlength="8" autocomplete="new-password"
        /></label>
        <label class="check"
          ><input type="checkbox" name="a" [(ngModel)]="admin" />
          {{ 'admin.role_admin' | t }}</label
        >
        <button type="submit" class="primary">{{ 'common.create' | t }}</button>
      </form>
      <p class="muted small">{{ 'admin.password_hint' | t }}</p>
    </section>
    <section class="card">
      <h2>{{ 'admin.selfcheck' | t }}</h2>
      <ul class="checks">
        @for (c of checks(); track c.name) {
          <li [class.bad]="!c.ok">
            <span class="check-icon" aria-hidden="true">{{ c.ok ? '✔' : '✖' }}</span>
            <strong>{{ 'check.' + c.name | t }}</strong>
            <span class="muted small check-detail">{{ 'check.' + c.detail | t: c.params }}</span>
          </li>
        }
      </ul>
    </section>
  `,
})
export class Admin implements OnInit {
  protected session = inject(SessionService);
  protected i18n = inject(I18n);
  private api = inject(Api);
  private notify = inject(Notify);
  protected users = signal<User[]>([]);
  protected checks = signal<Check[]>([]);
  protected username = '';
  protected display = '';
  protected password = '';
  protected admin = false;

  async ngOnInit(): Promise<void> {
    this.reload();
    this.checks.set(await this.api.get<Check[]>('selfcheck'));
  }

  async reload(): Promise<void> {
    this.users.set(await this.api.get<User[]>('users'));
  }

  async create(): Promise<void> {
    try {
      await this.api.post('users', {
        username: this.username,
        display: this.display,
        password: this.password,
        admin: this.admin,
      });
      this.notify.ok('admin.created_msg', { name: this.username });
      this.username = this.display = this.password = '';
      this.admin = false;
      await this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async resetPassword(u: User): Promise<void> {
    const pw = prompt(this.i18n.t('admin.prompt_password', { name: u.username }));
    if (!pw) return;
    try {
      await this.api.post(`users/${u.id}/password`, { password: pw });
      this.notify.ok('admin.password_updated');
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(u: User): Promise<void> {
    if (!confirm(this.i18n.t('admin.confirm_delete', { name: u.username }))) return;
    try {
      await this.api.delete(`users/${u.id}`);
      await this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }
}
