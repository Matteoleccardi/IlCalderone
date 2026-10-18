import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { RecipePanelComponent } from '../../core/features';
import { CollectionSummary, Recipe } from '../../core/models';
import { TPipe } from '../../core/i18n';
import { Notify } from '../../core/notify';

/** On the recipe page: tick the collections (that you can change) this recipe belongs to. */
@Component({
  selector: 'app-collection-panel',
  imports: [RouterLink, TPipe],
  template: `
    <section class="card">
      <h2>{{ 'nav.collections' | t }}</h2>
      @if (mine().length) {
        <div class="chips">
          @for (c of mine(); track c.id) {
            <label class="check chip">
              <input type="checkbox" [checked]="c.contains" (change)="toggle(c)" /> {{ c.name }}
            </label>
          }
        </div>
      } @else {
        <p class="muted small">{{ 'collections.none_yours' | t }} <a routerLink="/raccolte">{{ 'collections.create_one' | t }}</a></p>
      }
      @if (others().length) {
        <p class="small muted">{{ 'collections.also_in' | t }}
          @for (c of others(); track c.id) { <a [routerLink]="['/raccolte', c.id]">{{ c.name }}</a>{{ $last ? '' : ', ' }} }
        </p>
      }
    </section>
  `,
})
export class CollectionPanel implements RecipePanelComponent {
  readonly recipe = input.required<Recipe>();
  private api = inject(Api);
  private notify = inject(Notify);
  private list = signal<CollectionSummary[]>([]);
  protected mine = computed(() => this.list().filter((c) => c.can_edit));
  protected others = computed(() => this.list().filter((c) => !c.can_edit && c.contains));

  constructor() {
    effect(() => {
      const id = this.recipe().id;
      this.api.get<CollectionSummary[]>('collections', { recipe: id }).then((l) => this.list.set(l));
    });
  }

  async toggle(c: CollectionSummary): Promise<void> {
    const rid = this.recipe().id;
    try {
      if (c.contains) await this.api.delete(`collections/${c.id}/items/${rid}`);
      else await this.api.post(`collections/${c.id}/items`, { recipe: rid });
      this.list.update((l) => l.map((x) => (x.id === c.id ? { ...x, contains: !x.contains, count: x.count + (x.contains ? -1 : 1) } : x)));
    } catch (e) {
      this.notify.error(e);
    }
  }
}
