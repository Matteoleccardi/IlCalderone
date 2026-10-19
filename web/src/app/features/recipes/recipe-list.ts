import { Component, effect, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { TPipe } from '../../core/i18n';
import { RecipeSummary } from '../../core/models';
import { Notify } from '../../core/notify';
import { RecipeCard } from './recipe-card';

@Component({
  selector: 'app-recipe-list',
  imports: [FormsModule, RouterLink, RecipeCard, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="page-head">
      <h1>{{ 'nav.recipes' | t }}</h1>
      <div class="actions">
        <a routerLink="/ricette/nuova" class="button primary">+ {{ 'recipes.new' | t }}</a>
        <a routerLink="/ricette/importa" class="button">{{ 'recipes.import_export' | t }}</a>
      </div>
    </div>
    <form class="search" (ngSubmit)="apply()" role="search">
      <input
        name="q"
        [(ngModel)]="text"
        [placeholder]="'recipes.search_placeholder' | t"
        [attr.aria-label]="'recipes.search' | t"
        (input)="typed()"
      />
      <label class="check"
        ><input
          type="checkbox"
          name="mine"
          [ngModel]="mine() === '1'"
          (ngModelChange)="toggleMine($event)"
        />
        {{ 'recipes.only_mine' | t }}</label
      >
    </form>
    @if (loading()) {
      <p class="muted">{{ 'common.loading' | t }}</p>
    } @else if (recipes().length) {
      <p class="muted small">{{ 'recipes.count' | t: { n: recipes().length } }}</p>
      <div class="grid">
        @for (r of recipes(); track r.id) {
          <app-recipe-card [recipe]="r" />
        }
      </div>
    } @else {
      <p class="muted">{{ 'recipes.none_found' | t }}</p>
    }
  `,
})
export class RecipeList {
  /** Query params (bound by the router): ?q=…&mine=1 */
  readonly q = input<string>('');
  readonly mine = input<string>('');
  protected text = '';
  protected recipes = signal<RecipeSummary[]>([]);
  protected loading = signal(true);
  private api = inject(Api);
  private router = inject(Router);
  private notify = inject(Notify);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const q = this.q() ?? '';
      const mine = this.mine() === '1';
      this.text = q;
      this.load(q, mine);
    });
  }

  private async load(q: string, mine: boolean): Promise<void> {
    this.loading.set(true);
    try {
      this.recipes.set(
        await this.api.get<RecipeSummary[]>('recipes', { q, mine: mine ? 1 : undefined }),
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  typed(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.apply(), 300);
  }

  apply(): void {
    this.router.navigate([], {
      queryParams: { q: this.text || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  toggleMine(on: boolean): void {
    this.router.navigate([], {
      queryParams: { mine: on ? 1 : null },
      queryParamsHandling: 'merge',
    });
  }
}
