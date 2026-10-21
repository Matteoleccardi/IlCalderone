import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api';
import { HouseholdsService } from '../../core/households';
import { ConfirmService } from '../../core/confirm';
import { I18n, TPipe } from '../../core/i18n';
import { Household } from '../../core/models';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';

@Component({
  selector: 'app-households',
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>{{ 'nav.households' | t }}</h1>
    <p class="muted">{{ 'households.intro' | t }}</p>
    @for (h of hh.list(); track h.id) {
      <section class="card">
        <h2>{{ h.name }}</h2>
        <ul class="plain">
          @for (m of h.members; track m.user) {
            <li>
              {{ m.display ?? ('common.deleted_user' | t) }}
              @if (m.role === 'owner') {
                <span class="badge">{{ 'households.manager' | t }}</span>
              }
              @if (m.user === me()) {
                <button type="button" class="link" (click)="removeMember(h, m.user, true)">
                  {{ 'households.leave' | t }}
                </button>
              } @else if (isOwner(h)) {
                <button type="button" class="link" (click)="removeMember(h, m.user, false)">
                  {{ 'common.remove' | t }}
                </button>
              }
            </li>
          }
        </ul>
        @if (isOwner(h)) {
          <form class="row" (ngSubmit)="addMember(h, input.value); input.value = ''">
            <label
              >{{ 'households.add_by_username' | t }}
              <input #input name="u" [placeholder]="'login.username' | t"
            /></label>
            <button type="submit">{{ 'common.add' | t }}</button>
          </form>
        }
      </section>
    } @empty {
      <p>{{ 'households.none' | t }}</p>
    }
    <section class="card narrow">
      <h2>{{ 'households.new' | t }}</h2>
      <form (ngSubmit)="create()">
        <label
          >{{ 'common.name' | t }}
          <input
            name="name"
            [(ngModel)]="name"
            required
            [placeholder]="'households.name_placeholder' | t"
        /></label>
        <button type="submit" class="primary">{{ 'common.create' | t }}</button>
      </form>
    </section>
  `,
})
export class Households implements OnInit {
  protected hh = inject(HouseholdsService);
  private api = inject(Api);
  private notify = inject(Notify);
  private session = inject(SessionService);
  private i18n = inject(I18n);
  private confirmer = inject(ConfirmService);
  protected name = '';
  protected me = () => this.session.user()?.id;

  ngOnInit(): void {
    this.hh.refresh();
  }

  isOwner(h: Household): boolean {
    return h.members.some((m) => m.user === this.me() && m.role === 'owner');
  }

  async create(): Promise<void> {
    try {
      await this.api.post('households', { name: this.name });
      this.name = '';
      await this.hh.refresh();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async addMember(h: Household, username: string): Promise<void> {
    if (!username.trim()) return;
    try {
      await this.api.post(`households/${h.id}/members`, { username });
      await this.hh.refresh();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async removeMember(h: Household, uid: string, self: boolean): Promise<void> {
    const text = self
      ? this.i18n.t('households.confirm_leave', { name: h.name })
      : this.i18n.t('households.confirm_remove');
    if (!(await this.confirmer.ask(text, 'common.confirm'))) return;
    try {
      await this.api.delete(`households/${h.id}/members/${uid}`);
      await this.hh.refresh();
    } catch (e) {
      this.notify.error(e);
    }
  }
}
