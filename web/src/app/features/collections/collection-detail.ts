import { Component, effect, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Collection, Visibility } from '../../core/models';
import { I18n, TPipe } from '../../core/i18n';
import { Notify } from '../../core/notify';
import { AppTitle } from '../../core/title';
import { ScopePicker } from '../../shared/scope-picker';
import { VisibilityBadge } from '../../shared/visibility-badge';

@Component({
  selector: 'app-collection-detail',
  imports: [FormsModule, RouterLink, ScopePicker, VisibilityBadge, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (c(); as c) {
      <div class="page-head">
        <h1>{{ c.name }}</h1>
        <app-visibility [value]="c.visibility" />
      </div>
      @if (c.description) {
        <p>{{ c.description }}</p>
      }
      <p class="muted small">
        {{ 'common.by' | t: { name: c.owner_name ?? ('common.deleted_user' | t) } }}
      </p>
      @if (c.items.length) {
        <ul class="collection-items">
          @for (it of c.items; track it.recipe) {
            <li class="card">
              @if (it.available) {
                @if (it.photo) {
                  <img [src]="api.photoUrl(it.recipe)" alt="" loading="lazy" />
                }
                <a [routerLink]="['/ricette', it.recipe]">{{ it.title }}</a>
              } @else {
                <span class="muted">{{ 'common.unavailable_recipe' | t }}</span>
              }
              @if (it.note) {
                <span class="muted small">— {{ it.note }}</span>
              }
              @if (c.can_edit) {
                <button
                  type="button"
                  class="link"
                  (click)="removeItem(it.recipe)"
                  [attr.aria-label]="'collections.remove_item' | t"
                >
                  ✕
                </button>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="muted">{{ 'collections.empty' | t }}</p>
      }
      @if (c.can_edit) {
        <details class="card">
          <summary>{{ 'collections.edit' | t }}</summary>
          <form (ngSubmit)="save()">
            <label>{{ 'common.name' | t }} <input name="name" [(ngModel)]="name" required /></label>
            <label
              >{{ 'common.description' | t }}
              <textarea name="desc" [(ngModel)]="description" rows="2"></textarea>
            </label>
            <app-scope-picker [(visibility)]="visibility" [(household)]="household" />
            <div class="actions">
              <button type="submit" class="primary">{{ 'common.save' | t }}</button>
              <button type="button" class="danger" (click)="remove()">
                {{ 'collections.delete' | t }}
              </button>
            </div>
          </form>
        </details>
      }
    } @else {
      <p class="muted">{{ 'common.loading' | t }}</p>
    }
  `,
})
export class CollectionDetail {
  readonly id = input.required<string>();
  protected api = inject(Api);
  private notify = inject(Notify);
  private router = inject(Router);
  private title = inject(AppTitle);
  private i18n = inject(I18n);
  protected c = signal<Collection | null>(null);
  protected name = '';
  protected description = '';
  protected visibility = signal<Visibility>('private');
  protected household = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.load(this.id());
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.set(await this.api.get<Collection>(`collections/${id}`));
    } catch (e) {
      this.notify.error(e);
      this.router.navigateByUrl('/raccolte');
    }
  }

  private set(c: Collection): void {
    this.c.set(c);
    this.name = c.name;
    this.description = c.description;
    this.visibility.set(c.visibility);
    this.household.set(c.household);
    this.title.set(c.name);
  }

  async save(): Promise<void> {
    try {
      this.set(
        await this.api.put<Collection>(`collections/${this.id()}`, {
          name: this.name,
          description: this.description,
          visibility: this.visibility(),
          household: this.household(),
        }),
      );
      this.notify.ok('collections.saved');
    } catch (e) {
      this.notify.error(e);
    }
  }

  async removeItem(rid: string): Promise<void> {
    try {
      this.set(await this.api.delete<Collection>(`collections/${this.id()}/items/${rid}`));
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(): Promise<void> {
    if (!confirm(this.i18n.t('collections.confirm_delete'))) return;
    try {
      await this.api.delete(`collections/${this.id()}`);
      this.router.navigateByUrl('/raccolte');
    } catch (e) {
      this.notify.error(e);
    }
  }
}
