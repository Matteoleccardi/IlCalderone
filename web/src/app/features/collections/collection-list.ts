import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Collection, CollectionSummary, Visibility } from '../../core/models';
import { TPipe } from '../../core/i18n';
import { Notify } from '../../core/notify';
import { ScopePicker } from '../../shared/scope-picker';
import { VisibilityBadge } from '../../shared/visibility-badge';

@Component({
  selector: 'app-collection-list',
  imports: [FormsModule, RouterLink, ScopePicker, VisibilityBadge, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>{{ 'nav.collections' | t }}</h1>
    <p class="muted">{{ 'collections.intro' | t }}</p>
    @if (list().length) {
      <ul class="cards">
        @for (c of list(); track c.id) {
          <li class="card">
            <a [routerLink]="['/raccolte', c.id]"
              ><strong>{{ c.name }}</strong></a
            >
            <span class="muted small"
              >{{ 'recipes.count' | t: { n: c.count } }} ·
              {{ 'common.by' | t: { name: c.owner_name ?? ('common.deleted_user' | t) } }}</span
            >
            <app-visibility [value]="c.visibility" />
            @if (c.description) {
              <p class="small">{{ c.description }}</p>
            }
          </li>
        }
      </ul>
    } @else {
      <p class="muted">{{ 'collections.none' | t }}</p>
    }
    <section class="card narrow">
      <h2>{{ 'collections.new' | t }}</h2>
      <form (ngSubmit)="create()">
        <label
          >{{ 'common.name' | t }}
          <input
            name="name"
            [(ngModel)]="name"
            required
            maxlength="120"
            [placeholder]="'collections.name_placeholder' | t"
        /></label>
        <label
          >{{ 'common.description' | t }}
          <textarea name="desc" [(ngModel)]="description" rows="2"></textarea>
        </label>
        <app-scope-picker [(visibility)]="visibility" [(household)]="household" />
        <button type="submit" class="primary">{{ 'common.create' | t }}</button>
      </form>
    </section>
  `,
})
export class CollectionList implements OnInit {
  private api = inject(Api);
  private notify = inject(Notify);
  private router = inject(Router);
  protected list = signal<CollectionSummary[]>([]);
  protected name = '';
  protected description = '';
  protected visibility = signal<Visibility>('private');
  protected household = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.list.set(await this.api.get<CollectionSummary[]>('collections'));
  }

  async create(): Promise<void> {
    try {
      const c = await this.api.post<Collection>('collections', {
        name: this.name,
        description: this.description,
        visibility: this.visibility(),
        household: this.household(),
      });
      this.router.navigate(['/raccolte', c.id]);
    } catch (e) {
      this.notify.error(e);
    }
  }
}
