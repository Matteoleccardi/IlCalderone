import { Component, effect, inject, input, signal } from '@angular/core';
import { Api } from '../../core/api';
import { RecipePanelComponent } from '../../core/features';
import { I18n, TPipe } from '../../core/i18n';
import { Recipe } from '../../core/models';
import { Notify } from '../../core/notify';
import { today } from './dates';

/** On the recipe page: "I ate it" + how many times / when last. */
@Component({
  selector: 'app-meallog-panel',
  imports: [TPipe],
  template: `
    <section class="card">
      <h2>{{ 'nav.diary' | t }}</h2>
      <p>
        @if (stats().count) {
          {{ 'diary.eaten' | t: { n: stats().count, last: last() } }}
        } @else {
          {{ 'diary.never' | t }}
        }
      </p>
      <button type="button" (click)="ate()">🍽 {{ 'diary.ate_tonight' | t }}</button>
    </section>
  `,
})
export class MeallogPanel implements RecipePanelComponent {
  readonly recipe = input.required<Recipe>();
  private api = inject(Api);
  private notify = inject(Notify);
  private i18n = inject(I18n);
  protected stats = signal<{ count: number; last: string | null }>({ count: 0, last: null });
  protected last = () => (this.stats().last ? this.i18n.date(this.stats().last!) : '');

  constructor() {
    effect(() => {
      this.load(this.recipe().id);
    });
  }

  private async load(id: string): Promise<void> {
    this.stats.set(await this.api.get(`meallog/recipe/${id}`));
  }

  async ate(): Promise<void> {
    try {
      await this.api.post('meallog', { recipe: this.recipe().id, day: today(), meal: 'cena', servings: this.recipe().servings });
      this.notify.ok('diary.logged');
      await this.load(this.recipe().id);
    } catch (e) {
      this.notify.error(e);
    }
  }
}
